# 🔐 Logto Self-Hosted Configuration Guide

This guide details the steps to set up and configure a self-hosted instance of **Logto** for authentication within the ASM2 project.

---

## 🏗️ 1. Docker Compose Setup

Our setup uses a multi-service Docker environment. The Logto services depend on a dedicated PostgreSQL instance.

### 📝 Environment Variables

Ensure the following variables are defined in your root `.env` file:

```env
# Logto Database
LOGTO_POSTGRES_PASSWORD=your_secure_password

# Logto Endpoints
LOGTO_ADMIN_ENDPOINT=http://localhost:3002
LOGTO_ENDPOINT=http://localhost:3011
```

### 🐳 Container Mapping

In the `docker-compose.yml`, the Logto main service is mapped as follows:

- **Host Port `3011`** → **Container Port `3001`**
- **Host Port `3002`** → **Container Port `3002`** (Admin Console)

> [!IMPORTANT]
> The Logto main endpoint is set to port **3011** because our Dashboard runs on port **3001** on the host.

---

## 👤 2. Initial Administrator Creation

Once you run `docker-compose up -d`:

1.  **Navigate** to the Admin Console at [http://localhost:3002](http://localhost:3002).
2.  **Create a User**: The first user you create will automatically be granted **Administrative** privileges.

---

## 📱 3. Application Configuration (Next.js)

After entering the dashboard:

1.  Go to **Applications** in the sidebar.
2.  Click **Create Application** and select the **Next.js** template.
3.  **Client Credentials**: Logto will provide you with the following, which you must update in your `.env`:
    - `LOGTO_APP_ID`
    - `LOGTO_APP_SECRET`
    - `LOGTO_COOKIE_SECRET`

### 🔗 Callback URI (Critical Bug Fix)

There is a known issue in Logto where changing the default redirect URI behavior can fail. To ensure it works correctly:

- **Set Callback URI to**: `http://localhost:3001/callback`

> [!CHECK]
> The project is already configured to handle this at `dashboard/src/app/callback/route.ts`.

---

## 🧪 4. Testing the Integration

With the environment variables set, your application is ready to test:

1.  Restart the dashboard: `docker compose restart dashboard`.
2.  Open [http://localhost:3001](http://localhost:3001).
3.  Click **Sign In**.
4.  Initially, only **Username/Password** registration will be active.

---

## 🏢 5. Configuring Enterprise SSO

To allow users to sign in with corporate accounts:

1.  Go to the **Enterprise SSO** sidetab in the Logto Admin Console.
2.  Click **Add enterprise connector**.
3.  **Choose a Provider**: Select from Google Workspace, Microsoft Entra ID (OIDC/SAML), Okta, etc.
4.  **Configuration**: Follow the provider's specific steps (uploading metadata or entering Client IDs).
5.  **Activation**: Once saved, the SSO option will automatically appear on your sign-in page.

---

## 🛠️ Technical Reference

| Item                 | Value / Path                          |
| :------------------- | :------------------------------------ |
| **Admin Console**    | `http://localhost:3002`               |
| **Auth API**         | `http://localhost:3011`               |
| **Callback Handler** | `dashboard/src/app/callback/route.ts` |
| **Config Loader**    | `dashboard/src/lib/logto.ts`          |

---

_Created for the ASM2 Development Team._
