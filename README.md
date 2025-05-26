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
| 🔐 **Encrypted File Storage** | Files are encrypted at rest (AES-256-CBC) and in transit—**not even we can read them with direct storage access**. |
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

### File Encryption

All files uploaded to Synkros are encrypted at rest on the server using **AES-256-CBC encryption**. When a file is requested for download, it is decrypted on the server before being sent to the recipient. This ensures that your file contents remain private even if the underlying storage is directly accessed. The encryption and decryption processes require a secret `KEY` configured on the server and are handled automatically.

### Other Security Measures

- **End-to-End Encryption (Conceptual)**: While the server handles encryption/decryption, the design aims for a model where file access is controlled by unique links. Keys derived from these links (future enhancement) could enable true E2EE.
- **File keys are never stored (for client-side encryption model)** — access is only possible with the share link. *Note: Currently, server-side encryption relies on a server-managed key.*
- **No cookies, no analytics, no logs** (relevant access/error logs for maintenance are minimal).
- **Auto-deletion** of all uploads after 24 hours.
- Built with a **zero-knowledge approach aspiration**:
  > If someone asks us what you uploaded, and if client-side E2EE were fully implemented, we literally couldn't tell them. With current server-side encryption, server administrators with access to the `KEY` could decrypt files.

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
    *   `KEY`: This key is crucial for securing uploaded files using AES-256 encryption.
        *   **Format**: The `KEY` must be a string that is exactly 32 bytes (256 bits) long.
        *   **Example**: `KEY=MySuperSecretEncryptionKey123456` (Replace with your own strong key)
        *   **Generating a Key**: You can use a strong random string generator to create a suitable key. Ensure it meets the 32-byte length requirement. *For example, in Node.js: `require('crypto').randomBytes(32).toString('hex')` (use the first 32 characters of the hex output or ensure the resulting string is 32 bytes).*
    *   `SMTP_HOST`, `SMTP_PORT`, `MAIL_USER`, `MAIL_PASSWORD`: For email sending functionality.
    *   `CLEANUP_CODE`: A secret code for triggering the cleanup job manually via an API endpoint if needed.
    *   `ALLOWED_CLIENTS`: Comma-separated list of client URLs allowed to access the API (CORS).

**Important**: Keep your `.env` file (and especially the `KEY` and database credentials) secure and out of version control. The `.gitignore` file should already be configured to ignore `.env`.

---

## 🚀 Getting Started (Self-Hosting / Development)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/synkros.git 
    cd synkros
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Environment:**
    Create and configure your `.env` file as described in the "Environment Configuration" section above. Ensure `KEY` is set for encryption.
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

## 🧪 Development & Testing

The application includes an end-to-end test script (`test-encryption.js`) to verify the file encryption and decryption functionality.

To run this test:

1.  **Install development dependencies**:
    If you haven't already, or if they are not listed in `package.json`'s `devDependencies`:
    ```bash
    npm install --save-dev axios form-data
    ```
2.  **Ensure Server is Running**: The application server must be running.
3.  **Set Environment Key**: The `KEY` environment variable must be set in the *same terminal session* where you run the test script, or the server must have it configured.
    ```bash
    export KEY=YourSecretKeyForTesting123456789 # Example, use your actual test key
    ```
4.  **Execute the test script**:
    ```bash
    node test-encryption.js
    ```
    The script will create a sample file, upload it, download it, and verify that the original and downloaded contents match.

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
