# Sistema de alertas ante borrados masivos

## Objetivo

El sistema evita que una sincronización elimine de Qdrant un porcentaje peligroso del conjunto total de documentos previamente indexados en todas las fuentes que participan en la ejecución.

Managers y administradores pueden guardar un umbral entre el 1 % y el 100 %. Si los documentos que han desaparecido de la nube alcanzan o superan ese porcentaje, la ejecución se detiene antes de modificar Qdrant o el manifiesto y se registra una alerta.

No se configura un porcentaje inicial por defecto. El 40 % mencionado en el requisito era un ejemplo, no un valor acordado. Hasta que un manager o administrador guarde un porcentaje, la protección permanece desactivada y el indexado conserva su comportamiento anterior.

La protección puede desactivarse desde la interfaz guardando un umbral nulo. Además, cuando un borrado masivo es intencionado, un manager o administrador puede armar una excepción puntual: la siguiente ejecución del indexado omite el guard una sola vez y la protección se rearma automáticamente.

## Cálculo

El cálculo se hace con IDs de documentos del manifiesto, no con puntos o chunks de Qdrant:

```text
documentos_eliminados_totales =
    suma(ids_indexados_por_fuente - ids_encontrados_en_la_nube_por_fuente)

documentos_indexados_previamente_totales =
    suma(documentos_indexados_previamente_por_fuente)

porcentaje =
    documentos_eliminados_totales /
    documentos_indexados_previamente_totales * 100
```

La comparación es inclusiva:

```text
porcentaje >= umbral
```

Por tanto, 40 documentos ausentes de 100 entre todas las fuentes bloquean con un umbral del 40 %.

El umbral no se aplica por separado a cada fuente. Por ejemplo, si una fuente pequeña pierde 1 de 2 documentos y otra conserva sus 8 documentos, el impacto global es 1 de 10 (10 %), no 50 %, y no bloquea con un umbral del 40 %.


Un documento modificado mantiene su ID y no pertenece a la diferencia de conjuntos. Aunque después se reemplacen sus chunks, no cuenta como documento eliminado de la nube.

## Cambios de backend

### `backend/src/indexing/deletion_guard.py`

Contiene la lógica pura de detección:

- `DeletionImpact` transporta el ámbito evaluado, la cantidad total de documentos ausentes, el total previo agregado, el porcentaje, el umbral usado y el desglose por fuente. Para las evaluaciones agregadas el ámbito es `all_sources`.
- `SourceDeletionImpact` describe una fuente afectada: nombre, documentos ausentes y total previo de esa fuente.
- `DeletionThresholdExceeded` identifica específicamente un bloqueo por borrado masivo.
- `assess_cloud_deletions()` calcula el impacto.
- `enforce_deletion_guard()` lanza la excepción cuando corresponde.
- `assess_sources_cloud_deletions()` suma los ausentes y los totales de todos los snapshots, calcula un único porcentaje global y conserva el desglose de las fuentes con documentos ausentes.
- `enforce_sources_deletion_guard()` comprueba ese impacto agregado antes de que empiece la fase de escritura.

Casos especiales:

- sin documentos previos no hay bloqueo;
- sin IDs ausentes no hay bloqueo;
- un ID todavía presente no cuenta como borrado aunque haya cambiado su fecha de modificación.

La excepción transporta cantidades por fuente, no listas de IDs. El desglose solo incluye las fuentes con al menos un documento ausente, porque es lo que un manager necesita para saber dónde ocurrió el borrado.

### `backend/src/indexing/__init__.py`

Declara el paquete dedicado a las protecciones del indexado.

### `backend/src/config/indexing.py`

Encapsula las consultas PostgreSQL necesarias:

- `get_deletion_guard_config()` lee el umbral (que puede ser `NULL` mientras no se configure) y el estado de la excepción puntual.
- `set_deletion_threshold_percentage()` actualiza la fila singleton y exige que PostgreSQL confirme la actualización mediante `RETURNING`. Acepta `NULL` para desactivar la protección; en ese caso también desarma la excepción puntual, que dejaría de tener sentido.
- `set_deletion_guard_override()` arma o desarma la excepción puntual.
- `consume_deletion_guard_override()` desarma la excepción de forma atómica e informa de si estaba armada; el job de indexado la consume una sola vez.
- `create_indexing_alert()` registra el impacto, incluido el desglose por fuente en JSONB; `created_at` usa el valor por defecto de la tabla.
- `list_indexing_alerts()` devuelve las alertas recientes ordenadas por ID descendente, excluyendo las que el usuario solicitante ya descartó.
- `dismiss_indexing_alert()` y `dismiss_all_indexing_alerts()` registran descartes por usuario; las alertas nunca se borran globalmente desde la API.

No se escriben campos de auditoría que la aplicación no lea, ni se intenta reparar durante una lectura una fila que el script de inicialización ya crea.

### `backend/src/connectors/store.py`

`build_vectordb_from_sources()` recibe el umbral como `float | None`.

Después de listar y agrupar las fuentes:

1. Si el umbral es `None`, continúa el flujo existente sin ejecutar el guard.
2. Si hay umbral, lee del manifiesto los IDs previamente procesados.
3. Compara esos IDs con los encontrados en la nube dentro de cada fuente.
4. Suma los documentos ausentes y los totales previos de todas las fuentes y evalúa una sola vez el porcentaje global antes de llamar a `build_vectorstore()`.
5. Si todas pasan, continúa el indexado original sin otros cambios.

No se añadió una segunda comprobación dentro de `build_vectorstore()`: no existen llamadas directas que justifiquen duplicar el guard.

Tampoco se modificaron los filtros de Qdrant, la extracción de temas ni otros comportamientos preexistentes que no forman parte del requisito.

### `backend/src/connectors/drive.py`

Se eliminó el `try/except: pass` que descartaba silenciosamente un archivo cuando fallaba la lectura de sus permisos.

Este cambio se mantiene porque el detector usa directamente la lista devuelta por Drive: descartar un archivo existente lo convertiría en un falso borrado. Al propagar el error, la ejecución aborta antes del preflight y no confunde un fallo de lectura con una eliminación real.


### `backend/server.py`

La ejecución de indexado:

1. Lee el umbral de PostgreSQL.
2. Si hay umbral y la excepción puntual está armada, la consume y ejecuta esa pasada sin guard, dejando constancia en el log.
3. Pasa el umbral efectivo a `build_vectordb_from_sources()`.
4. Si la función termina normalmente, continúa el flujo existente.
5. Si recibe `DeletionThresholdExceeded`, elimina `VDB_LOCK`, persiste una alerta y registra el bloqueo.

Al eliminar `VDB_LOCK`, la indexación queda desactivada y las ejecuciones periódicas posteriores no continúan hasta que un administrador vuelva a iniciarla.

No se añadió un lock de concurrencia nuevo, porque no forma parte del problema solicitado.

Endpoints:

```http
GET /indexing/deletion-guard
PUT /indexing/deletion-guard
PUT /indexing/deletion-guard/override
GET /indexing/alerts?limit=50
DELETE /indexing/alerts
DELETE /indexing/alerts/{alert_id}
```

Todos requieren `manager` o `admin`. Los `DELETE` no borran las alertas: registran un descarte del usuario autenticado, de modo que cada manager gestiona su propia lista. `PUT /indexing/deletion-guard` acepta `threshold_percentage: null` para desactivar la protección. `PUT /indexing/deletion-guard/override` responde 409 si se intenta armar la excepción sin un umbral configurado. Los endpoints ya existentes para iniciar y detener el indexado siguen siendo exclusivos de `admin`.

### `backend/src/model/endpoints.py`

Modelos añadidos:

- `DeletionGuardConfigModel`: respuesta con `threshold_percentage: float | None` y `override_pending: bool`.
- `DeletionGuardUpdateModel`: petición de actualización con validación entre 1 y 100; admite `null` para desactivar la protección.
- `DeletionGuardOverrideModel`: petición para armar o desarmar la excepción puntual.
- `IndexingAlertSourceImpactModel`: desglose de una fuente afectada dentro de una alerta.
- `IndexingAlertModel`: datos necesarios para entregar una alerta, incluido el desglose por fuente (nulo en alertas históricas).
- `IndexingManagementAuth`: autorización común para managers y administradores.

### `sql/init_tsdb.sql`

Se crean tres tablas.

#### `indexing_deletion_guard`

Tabla singleton:

```text
id = 1
threshold_percentage = NULL hasta que se configure
override_pending = FALSE salvo que se arme la excepción puntual
```

El `CHECK` restringe cualquier valor no nulo al intervalo 1–100.

El script inserta únicamente la fila `id = 1` con `ON CONFLICT DO NOTHING`. Esto sí es necesario porque `timescaledb-init` vuelve a ejecutar `init_tsdb.sql` al arrancar y el script debe ser idempotente. Por el mismo motivo, las columnas añadidas después del despliegue inicial (`override_pending`, `source_breakdown`) usan `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

#### `indexing_alerts`

Guarda:

- ID autoincremental;
- ámbito (`all_sources` para las nuevas alertas agregadas; las alertas históricas pueden conservar una fuente concreta);
- documentos ausentes totales;
- total previo agregado;
- porcentaje;
- umbral usado;
- fecha de creación;
- desglose por fuente en JSONB (`NULL` en alertas anteriores al cambio).

No hay índice duplicado sobre el ID. La clave primaria ya crea el B-tree que PostgreSQL puede recorrer en sentido descendente para `ORDER BY id DESC`.

#### `indexing_alert_dismissals`

Registra qué usuario descartó qué alerta (`PRIMARY KEY (user_id, alert_id)` con `ON DELETE CASCADE`). Un descarte oculta la alerta solo en la lista de ese usuario; el resto de managers y administradores la siguen viendo.

## Pruebas de backend

### `backend/tests/test_deletion_guard.py`

Comprueba:

- bloqueo al igualar el umbral;
- no bloqueo por debajo;
- exclusión de documentos modificados;
- primera indexación sin documentos previos;
- contenido de la excepción;
- una fuente pequeña por encima del umbral individual que no alcanza el umbral global;
- bloqueo al alcanzar el umbral agregado;
- desglose que incluye solo las fuentes con documentos ausentes.

Se retiraron pruebas duplicadas y una comprobación tautológica que no probaba una llamada real al builder.

## Cambios de frontend

### `frontend/src/features/indexing-alerts/types.ts`

Define:

- `DeletionGuardConfig`, cuyo porcentaje puede ser `null`, con el estado de la excepción puntual.
- `DeletionGuardUpdate`, cuyo porcentaje admite `null` para desactivar la protección.
- `DeletionGuardOverrideUpdate`, para armar o desarmar la excepción puntual.
- `IndexingAlertSourceImpact`, con el desglose de una fuente afectada.
- `IndexingDeletionAlert`, con el contrato de una alerta.

### `frontend/src/features/indexing-alerts/api.ts`

Incluye:

- petición autenticada con el access token de Logto;
- GET del umbral;
- PUT del umbral, incluido `null` para desactivar la protección;
- PUT de la excepción puntual;
- GET de alertas;
- DELETE de descarte por alerta y de descarte de todas las alertas del usuario;
- polling cada 15 segundos, también con la pestaña en segundo plano;
- actualización de la caché tras guardar el porcentaje, la excepción o un descarte.

Las queries reciben `enabled=false` para usuarios que no sean manager o admin, por lo que no solicitan token ni hacen peticiones.

### `frontend/src/features/indexing-alerts/logic.ts`

`parseDeletionThreshold()` acepta valores entre 1 y 100, incluyendo punto o coma decimal.

`selectAlertsToNotify()` usa el último ID notificado:

- sin ID previo, selecciona solo la alerta más reciente para no emitir hasta 50 avisos históricos al abrir la aplicación;
- con ID previo, selecciona todas las alertas con un ID mayor.

### `frontend/src/features/indexing-alerts/notification-storage.ts`

Guarda un único `lastNotifiedAlertId` por usuario en `localStorage`.

Los IDs de las alertas son autoincrementales, por lo que no es necesario mantener un conjunto de 200 IDs. El último ID es suficiente para evitar que el polling repita una notificación.

### `frontend/src/features/indexing-alerts/indexing-alert-center.tsx`

El componente:

- solo se activa para managers y administradores;
- mantiene activa la consulta periódica de alertas;
- carga y guarda el umbral;
- ofrece un botón para desactivar la protección cuando hay un umbral guardado;
- muestra, con umbral configurado, la sección de excepción puntual para permitir u omitir la próxima ejecución, con opción de cancelarla mientras siga armada;
- deja el input vacío cuando todavía no hay configuración;
- evita que un refetch sobrescriba una edición sin guardar;
- muestra el historial de alertas del usuario con el desglose por fuente cuando existe;
- descarta alertas de forma individual o todas a la vez, esta última con diálogo de confirmación, y solo para el usuario actual;
- solicita permiso de notificaciones mediante una acción del usuario;
- emite un toast y, con permiso concedido, una notificación nativa;
- guarda el último ID procesado por usuario;
- muestra un error si no se pueden consultar las alertas.

### Integración

- `frontend/src/app/_components/app-layout.tsx` monta el centro en el dashboard.
- `frontend/src/features/chat/chat-shell.tsx` lo monta en el chat. Dashboard y chat usan shells distintos, por lo que ambos montajes son necesarios.
- `frontend/src/main.tsx` monta el `Toaster` global.

En `chat-shell.tsx` solo se añadieron el import y el componente; no se reformateó el resto del fichero.

### Traducciones

Los ficheros siguientes añaden únicamente los textos usados por el formulario, los permisos, los errores y las notificaciones:

- `frontend/src/i18n/messages/es.json`
- `frontend/src/i18n/messages/en.json`
- `frontend/src/i18n/messages/gl.json`

### Pruebas de frontend

- `api.test.tsx`: peticiones autenticadas, estado sin configurar, queries desactivadas, PUT del umbral (incluido `null`) y PUT de la excepción puntual.
- `logic.test.ts`: validación del porcentaje y selección por último ID.
- `notification-storage.test.ts`: almacenamiento por usuario e IDs inválidos.
- `indexing-alert-center.test.tsx`: acceso de user, manager y admin.

## Flujo completo

```text
Admin inicia indexado
        |
        v
Backend lee el umbral
        |
        +-- NULL ----------> indexado anterior, sin guard
        |
        +-- 1..100
              |
              +-- excepción puntual armada --> se consume y la pasada
              |                                se ejecuta sin guard
              v
      Se listan y agrupan las fuentes
              |
              v
      Preflight agregado por IDs de documentos
              |
              +-- porcentaje < umbral --> indexado normal
              |
              +-- porcentaje >= umbral
                         |
                         v
             quitar VDB_LOCK + guardar alerta
                     (con desglose por fuente)
                         |
                         v
             polling de managers/admins
                         |
                         v
                 toast + Notification
```

### Configuración

En el estado inicial, `threshold_percentage` es `NULL`. Un manager o administrador abre la campana, introduce un valor entre 1 y 100 y lo guarda. Con un umbral guardado, el mismo formulario ofrece desactivar la protección, lo que devuelve el umbral a `NULL` y desarma cualquier excepción pendiente.

El backend y PostgreSQL vuelven a validar el intervalo; no se confía únicamente en el input del navegador.

### Detección

En el siguiente indexado protegido se comparan los IDs del manifiesto con los IDs actuales dentro de cada fuente. Después se suman los ausentes y los totales previos de todas las fuentes para obtener un único porcentaje global.

Los documentos nuevos no reducen el porcentaje: el denominador es la suma del corpus anterior de todas las fuentes evaluadas, porque se mide cuánto contenido previamente indexado desaparecería.

### Bloqueo

Si se alcanza el umbral, la excepción se produce antes de llamar a `build_vectorstore()`. El servidor elimina `VDB_LOCK`, guarda la alerta y no modifica Qdrant ni el manifiesto.

Solo un administrador puede volver a iniciar el indexado. Si los mismos documentos continúan ausentes, el guard volverá a bloquear y generará una nueva alerta.

Cuando el borrado es intencionado, un manager o administrador arma la excepción puntual desde la campana. La siguiente ejecución consume la excepción y omite el guard una sola vez; después la protección vuelve a aplicarse con el mismo umbral, sin pasos manuales adicionales.

### Notificación

El frontend consulta las últimas alertas cada 15 segundos. Para cada alerta nueva:

- muestra un toast;
- muestra una notificación nativa si existe permiso;
- guarda su ID como último notificado.

La primera vez solo avisa de la alerta más reciente para evitar una ráfaga de eventos antiguos.

## Alcance de la notificación

La implementación usa polling HTTP más la Web Notification API. Funciona mientras la aplicación está cargada, incluso con la pestaña en segundo plano.

No es Web Push con Service Worker y VAPID, por lo que no entrega avisos con el navegador o el sitio completamente cerrados.
