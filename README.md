# 🚀 Synkros  
**Share your files with ease. No bullshit.**  
🌐 [https://synkross.alwaysdata.net](https://synkross.alwaysdata.net)

  [![Better Stack Badge](https://uptime.betterstack.com/status-badges/v1/monitor/1wh9v.svg)](https://synkross.alwaysdata.net/)

---

## 🧭 Overview

**Synkros** is a no-nonsense, privacy-first file sharing web app designed for **speed, simplicity, and security**.  
No ads. No accounts. No tracking. Just encrypted, temporary file sharing that works.

Whether you’re sending a project build, a resume, or a dumb meme—Synkros makes it effortless.

---

## ⚡ Features

| Feature | Description |
|--------|-------------|
| ⏲️ **Auto-Delete After 24 Hours** | Files are automatically removed after 24h to keep things clean and temporary. |
| 🔐 **End-to-End Encrypted Storage** | Files are encrypted client-side (AES-256-GCM) before upload—**not even the server can read them**. |
| 📱 **QR Code for Each File** | Instantly generate a scannable QR code for every upload—perfect for sharing across devices. |
| ✉️ **Email Link to Recipient** | Enter an email, and Synkros will mail the file link directly—no hassle. |
| 🧼 **Minimalist UI** | Designed to be dead simple. Drag. Drop. Done. |
| 🌐 **24/7 Uptime** | Always available, whether you're working at 3PM or 3AM. |
| 💸 **Free for Life** | No subscriptions, no upsells. Ever. |
| 🧩 **All File Types Supported** | Upload anything from docs and zips to videos, images, and code. |
| 🧍 **No Accounts Needed** | Truly anonymous uploads. We don’t want your email. We don’t even ask. |
| 🛡️ **Privacy-First Philosophy** | No cookies. No analytics. No user tracking. Just files. |
| 📱 **Mobile + Desktop Optimized** | Seamless experience across all devices and screen sizes. |

---

## 🎯 Use Cases

- 📁 **Quick Sharing** — Skip cloud drive clutter and just send a damn file.
- 🔐 **Confidential Docs** — Need-to-know files, auto-deleted after 24 hours.
- 📸 **Scan-to-Send** — Transfer files between devices via QR without cables or logins.
- 📧 **Email Drop-Off** — Deliver links directly via email, no login needed.
- 🧪 **Temporary Hosting** — Send builds, patches, test data without worrying about cleanup.
- 🤐 **Anonymous Uploads** — Send without being seen, tracked, or profiled.

---

## 🔐 Security Features

### End-to-End Encryption (E2EE)

Synkros implements **true end-to-end encryption** using **AES-256-GCM encryption**:

- **Client-Side Encryption**: Files are encrypted in your browser before upload using the Web Crypto API
- **Unique Keys**: Each file gets its own randomly generated 256-bit encryption key
- **Key in URL Fragment**: The encryption key is embedded in the download URL fragment (`#key`) and never sent to the server
- **Server-Side Blind**: The server stores only encrypted data and cannot decrypt files without the key
- **Client-Side Decryption**: Files are decrypted in the recipient's browser when downloaded

### Zero-Knowledge Architecture

- **Encryption keys are never stored on the server** — access is only possible with the complete share link
- **Server cannot decrypt files** — even with full server access, files remain encrypted
- **No cookies, no analytics, no logs** (minimal access/error logs for maintenance only)
- **Auto-deletion** of all uploads after 24 hours
- Built with a **true zero-knowledge approach**:
  > If someone asks us what you uploaded, we literally couldn't tell them even if we wanted to.

---

## 🛠️ Environment Configuration

For self-hosting or development, this application requires certain environment variables to be set. These are managed in a `.env` file in the root of the project.

1.  **Create the `.env` file**: If you don't already have one, create a `.env` file in the root of the project. You can do this by copying the example file:
    ```bash
    cp .env.example .env
    ```

2.  **Set Essential Variables**: Open your `.env` file and configure the following:
    *   `MONGODB_CONNECTION_URL`: Your MongoDB connection string.
    *   `APP_BASE_URL`: The base URL of your application (e.g., `http://localhost:3000`).
    *   `PORT`: The port the application should run on (e.g., `3000`).
    *   ~~`KEY`: No longer needed - E2EE encryption keys are generated client-side~~
    *   `SMTP_HOST`, `SMTP_PORT`, `MAIL_USER`, `MAIL_PASSWORD`: For email sending functionality.
    *   `CLEANUP_CODE`: A secret code for triggering the cleanup job manually via an API endpoint if needed.
    *   `ALLOWED_CLIENTS`: Comma-separated list of client URLs allowed to access the API (CORS).

**Important**: Keep your `.env` file secure and out of version control. The `.gitignore` file should already be configured to ignore `.env`.

---

## 🚀 Getting Started (Self-Hosting / Development)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/axrxvm/synkros.git 
    cd synkros
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Environment:**
    Create and configure your `.env` file as described in the "Environment Configuration" section above. Note: The `KEY` variable is no longer needed as encryption is handled client-side.
4.  **Run the application:**
    *   For development with auto-reloading:
        ```bash
        npm run dev
        ```
    *   For production:
        ```bash
        npm start
        ```
    The server should now be running on the `PORT` specified in your `.env` file.

---

## 🌍 Live Demo

Try it now — no login, no install:  
🔗 **[https://synkross.alwaysdata.net](https://synkross.alwaysdata.net)**

---

## 🤝 Contributing

Pull requests are welcome!  
If you have ideas or feature requests, open an issue or start a discussion.

---

## 🧾 License

**MIT License** – Free for personal or commercial use.  
Just don’t pretend you built it.

---

## 💬 Feedback & Support

Have a feature idea or just love the concept?  
Open an issue or star the repo to show support.

**Built with love (and no bullshit) for people who just want file sharing to work.**  
**Welcome to Synkros.**
