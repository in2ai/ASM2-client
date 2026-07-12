# Sistema de alertas ante borrados masivos

## Objetivo

El sistema evita que una sincronización elimine de Qdrant un porcentaje peligroso de los documentos previamente indexados.

Managers y administradores pueden guardar un umbral entre el 1 % y el 100 %. Si los documentos que han desaparecido de la nube alcanzan o superan ese porcentaje, la ejecución se detiene antes de modificar Qdrant o el manifiesto y se registra una alerta.

No se configura un porcentaje inicial por defecto. El 40 % mencionado en el requisito era un ejemplo, no un valor acordado. Hasta que un manager o administrador guarde un porcentaje, la protección permanece desactivada y el indexado conserva su comportamiento anterior.

## Cálculo

El cálculo se hace con IDs de documentos del manifiesto, no con puntos o chunks de Qdrant:

```text
documentos_eliminados = ids_indexados - ids_encontrados_en_la_nube

porcentaje =
    documentos_eliminados / documentos_indexados_previamente * 100
```

La comparación es inclusiva:

```text
porcentaje >= umbral
```

Por tanto, 40 documentos ausentes de 100 bloquean con un umbral del 40 %.

Un documento modificado mantiene su ID y no pertenece a la diferencia de conjuntos. Aunque después se reemplacen sus chunks, no cuenta como documento eliminado de la nube.

## Cambios de backend

### `backend/src/indexing/deletion_guard.py`

Contiene la lógica pura de detección:

- `DeletionImpact` transporta la fuente, la cantidad de documentos ausentes, el total previo, el porcentaje y el umbral usado.
- `DeletionThresholdExceeded` identifica específicamente un bloqueo por borrado masivo.
- `assess_cloud_deletions()` calcula el impacto.
- `enforce_deletion_guard()` lanza la excepción cuando corresponde.
- `enforce_sources_deletion_guard()` comprueba todos los snapshots antes de que empiece la fase de escritura.

Casos especiales:

- sin documentos previos no hay bloqueo;
- sin IDs ausentes no hay bloqueo;
- un ID todavía presente no cuenta como borrado aunque haya cambiado su fecha de modificación.

La excepción solo transporta la cantidad de documentos ausentes. No conserva una lista de IDs que ningún consumidor utiliza.

### `backend/src/indexing/__init__.py`

Declara el paquete dedicado a las protecciones del indexado.

### `backend/src/config/indexing.py`

Encapsula las consultas PostgreSQL necesarias:

- `get_deletion_threshold_percentage()` lee el umbral, que puede ser `NULL` mientras no se configure.
- `set_deletion_threshold_percentage()` actualiza la fila singleton y exige que PostgreSQL confirme la actualización mediante `RETURNING`.
- `create_indexing_alert()` registra el impacto; `created_at` usa el valor por defecto de la tabla.
- `list_indexing_alerts()` devuelve las alertas recientes ordenadas por ID descendente.

No se escriben campos de auditoría que la aplicación no lea, ni se intenta reparar durante una lectura una fila que el script de inicialización ya crea.

### `backend/src/connectors/store.py`

`build_vectordb_from_sources()` recibe el umbral como `float | None`.

Después de listar y agrupar las fuentes:

1. Si el umbral es `None`, continúa el flujo existente sin ejecutar el guard.
2. Si hay umbral, lee del manifiesto los IDs previamente procesados.
3. Compara esos IDs con los encontrados en la nube.
4. Evalúa todas las fuentes antes de llamar a `build_vectorstore()`.
5. Si todas pasan, continúa el indexado original sin otros cambios.

No se añadió una segunda comprobación dentro de `build_vectorstore()`: no existen llamadas directas que justifiquen duplicar el guard.

Tampoco se modificaron los filtros de Qdrant, la extracción de temas ni otros comportamientos preexistentes que no forman parte del requisito.

### `backend/src/connectors/drive.py`

Se eliminó el `try/except: pass` que descartaba silenciosamente un archivo cuando fallaba la lectura de sus permisos.

Este cambio se mantiene porque el detector usa directamente la lista devuelta por Drive: descartar un archivo existente lo convertiría en un falso borrado. Al propagar el error, la ejecución aborta antes del preflight y no confunde un fallo de lectura con una eliminación real.

### `backend/server.py`

La ejecución de indexado:

1. Lee el umbral de PostgreSQL.
2. Lo pasa a `build_vectordb_from_sources()`.
3. Si la función termina normalmente, continúa el flujo existente.
4. Si recibe `DeletionThresholdExceeded`, elimina `VDB_LOCK`, persiste una alerta y registra el bloqueo.

Al eliminar `VDB_LOCK`, la indexación queda desactivada y las ejecuciones periódicas posteriores no continúan hasta que un administrador vuelva a iniciarla.

No se añadió un lock de concurrencia nuevo ni un estado de resolución de alertas, porque no forman parte del problema solicitado.

Endpoints añadidos:

```http
GET /indexing/deletion-guard
PUT /indexing/deletion-guard
GET /indexing/alerts?limit=50
```

Los tres requieren `manager` o `admin`. Los endpoints ya existentes para iniciar y detener el indexado siguen siendo exclusivos de `admin`.

### `backend/src/model/endpoints.py`

Modelos añadidos:

- `DeletionGuardConfigModel`: respuesta con `threshold_percentage: float | None`.
- `DeletionGuardUpdateModel`: petición de actualización con validación entre 1 y 100.
- `IndexingAlertModel`: datos necesarios para entregar una alerta.
- `IndexingManagementAuth`: autorización común para managers y administradores.

Separar el modelo de lectura del de escritura permite representar el estado inicial sin configurar, pero impide guardar `null` o porcentajes inválidos.

### `sql/init_tsdb.sql`

Se crean dos tablas.

#### `indexing_deletion_guard`

Tabla singleton:

```text
id = 1
threshold_percentage = NULL hasta que se configure
```

El `CHECK` restringe cualquier valor no nulo al intervalo 1–100.

El script inserta únicamente la fila `id = 1` con `ON CONFLICT DO NOTHING`. Esto sí es necesario porque `timescaledb-init` vuelve a ejecutar `init_tsdb.sql` al arrancar y el script debe ser idempotente.

#### `indexing_alerts`

Guarda:

- ID autoincremental;
- fuente;
- documentos ausentes;
- total previo;
- porcentaje;
- umbral usado;
- fecha de creación.

No hay `ALTER TABLE`, estado de resolución ni índice duplicado sobre el ID. La clave primaria ya crea el B-tree que PostgreSQL puede recorrer en sentido descendente para `ORDER BY id DESC`.

## Pruebas de backend

### `backend/tests/test_deletion_guard.py`

Comprueba:

- bloqueo al igualar el umbral;
- no bloqueo por debajo;
- exclusión de documentos modificados;
- primera indexación sin documentos previos;
- contenido de la excepción;
- detección de la fuente que bloquea en una evaluación múltiple.

Se retiraron pruebas duplicadas y una comprobación tautológica que no probaba una llamada real al builder.

## Cambios de frontend

### `frontend/src/features/indexing-alerts/types.ts`

Define:

- `DeletionGuardConfig`, cuyo porcentaje puede ser `null`.
- `DeletionGuardUpdate`, cuyo porcentaje siempre es numérico.
- `IndexingDeletionAlert`, con el contrato de una alerta.

### `frontend/src/features/indexing-alerts/api.ts`

Incluye:

- petición autenticada con el access token de Logto;
- GET del umbral;
- PUT del umbral;
- GET de alertas;
- polling cada 15 segundos, también con la pestaña en segundo plano;
- actualización de la caché tras guardar el porcentaje.

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
- deja el input vacío cuando todavía no hay configuración;
- evita que un refetch sobrescriba una edición sin guardar;
- solicita permiso de notificaciones mediante una acción del usuario;
- emite un toast y, con permiso concedido, una notificación nativa;
- guarda el último ID procesado por usuario;
- muestra un error si no se pueden consultar las alertas.

Se retiraron el historial visual, el contador de no leídas, el refresco manual y los estados de resolución porque no son necesarios para configurar el umbral ni entregar el aviso.

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

- `api.test.tsx`: peticiones autenticadas, estado sin configurar, queries desactivadas y PUT.
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
              v
      Se listan y agrupan las fuentes
              |
              v
      Preflight por IDs de documentos
              |
              +-- porcentaje < umbral --> indexado normal
              |
              +-- porcentaje >= umbral
                         |
                         v
             quitar VDB_LOCK + guardar alerta
                         |
                         v
             polling de managers/admins
                         |
                         v
                 toast + Notification
```

### Configuración

En el estado inicial, `threshold_percentage` es `NULL`. Un manager o administrador abre la campana, introduce un valor entre 1 y 100 y lo guarda.

El backend y PostgreSQL vuelven a validar el intervalo; no se confía únicamente en el input del navegador.

### Detección

En el siguiente indexado protegido se comparan los IDs del manifiesto con los IDs actuales de cada fuente.

Los documentos nuevos no reducen el porcentaje: el denominador es el corpus anterior, porque se mide cuánto contenido previamente indexado desaparecería.

### Bloqueo

Si se alcanza el umbral, la excepción se produce antes de llamar a `build_vectorstore()`. El servidor elimina `VDB_LOCK`, guarda la alerta y no modifica Qdrant ni el manifiesto.

Solo un administrador puede volver a iniciar el indexado. Si los mismos documentos continúan ausentes, el guard volverá a bloquear y generará una nueva alerta.

### Notificación

El frontend consulta las últimas alertas cada 15 segundos. Para cada alerta nueva:

- muestra un toast;
- muestra una notificación nativa si existe permiso;
- guarda su ID como último notificado.

La primera vez solo avisa de la alerta más reciente para evitar una ráfaga de eventos antiguos.

## Alcance de la notificación

La implementación usa polling HTTP más la Web Notification API. Funciona mientras la aplicación está cargada, incluso con la pestaña en segundo plano.

No es Web Push con Service Worker y VAPID, por lo que no entrega avisos con el navegador o el sitio completamente cerrados.
