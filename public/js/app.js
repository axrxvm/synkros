const uploadView = document.querySelector(".upload-container");
const progressView = document.querySelector(".uploader-progress-ui");
const progressBar = document.querySelector("#progressBar");
const postUploadView = document.querySelector(".postupload-ui");
const anims = document.querySelectorAll(".will-fade-in");
const statusText = document.querySelector(".complete-text");
const qrcode = document.querySelector("#qrcode");

const dropzone = document.querySelector(".dropzone");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("fileSelectBtn");

const qrImg = document.querySelector("#qrCodeSrc");
const sharingContainer = document.querySelector(".sharing-container");
const copyURLBtn = document.getElementById("copyURLBtn");
const fileURL = document.getElementById("fileURL");
const emailBtn = document.getElementById("emailBtn");
const emailFormContainer = document.getElementById("emailForm");
const emailForm = document.getElementById("mailForm");
const emailSendBtn = document.getElementById("emailSendBtn");
const goBackBtn = document.getElementById("goBackBtn");
const toast = document.querySelector(".toast");

const cleanupBtn = document.querySelector("#cleanup-btn");
const logoBtn = document.getElementById("logoBtn");

let uploadStartTime; // To store the time when upload starts
const uploadSpeedEl = document.getElementById("uploadSpeed"); // Assuming ID for speed element
const uploadETAEl = document.getElementById("uploadETA"); // Assuming ID for ETA element


const maxAllowedFileSize = 500 * 1024 * 1024;
const maxAllowedFileSizeInWords = "500MB";

window.addEventListener("DOMContentLoaded", (event) => {
  anims.forEach((el) => el.classList.remove("fade-in"));
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (!dropzone.classList.contains("dragged")) {
    dropzone.classList.add("dragged");
  }
});
dropzone.addEventListener("dragleave", (e) => {
  dropzone.classList.remove("dragged");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragged");
  const files = e.dataTransfer.files;
  if (files.length === 1) {
    if (files[0].size < maxAllowedFileSize) {
      fileInput.files = files;
      uploadFile();
    } else {
      showToast(`Max file size is ${maxAllowedFileSizeInWords}}`);
    }
  } else if (files.length > 1) {
    showToast("Multiple file upload not supported");
  }
});

browseBtn.addEventListener("click", (e) => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0].size > maxAllowedFileSize) {
    showToast(`Max file size is ${maxAllowedFileSizeInWords}`);
    fileInput.value = "";
    return;
  }
  uploadFile();
});

const uploadFile = async () => {
  uploadView.style.display = "none";
  progressView.style.display = "block";
  postUploadView.style.display = "none";

  // Reset speed and ETA text
  if (uploadSpeedEl) uploadSpeedEl.innerText = "";
  if (uploadETAEl) uploadETAEl.innerText = "";

  try {
    const file = fileInput.files[0];
    
    // Check for performance warnings and show user feedback
    if (window.e2eeOptimizer) {
      const warning = window.e2eeOptimizer.getLargeFileWarning(file.size);
      if (warning) {
        console.log(`${warning.level.toUpperCase()}: ${warning.title} - ${warning.message}`);
        // You could show this in a modal or toast if desired
      }
      
      // Check memory availability
      if (!window.e2eeOptimizer.hasEnoughMemory(file.size)) {
        showToast('Warning: This file is very large and may cause performance issues on this device.');
      }
    }
    
    // Show encryption progress
    progressBar.style.width = `0%`;
    statusText.textContent = "Preparing encryption...";
    
    // Generate encryption key and encrypt file client-side with progress
    const encryptionKey = await window.e2eeCrypto.generateKey();
    const keyHex = await window.e2eeCrypto.exportKeyToHex(encryptionKey);
    
    statusText.textContent = "Encrypting file...";
    
    const encryptionResult = await window.e2eeCrypto.encryptFileWithProgress(
      file, 
      keyHex,
      (progress) => {
        // Show encryption progress (0-30% of total progress)
        const encryptionProgress = Math.round(progress * 0.3);
        progressBar.style.width = `${encryptionProgress}%`;
        statusText.textContent = `Encrypting... ${progress}%`;
      }
    );
    
    // Log compression savings if available
    if (encryptionResult.compressedSize && encryptionResult.originalSize) {
      const compressionRatio = ((1 - encryptionResult.compressedSize / encryptionResult.originalSize) * 100).toFixed(1);
      console.log(`Compression saved ${compressionRatio}% storage space`);
    }
    
    // Update status for upload phase
    statusText.textContent = "Starting upload...";
    
    const formData = new FormData();
    formData.append("myFile", encryptionResult.blob, file.name + '.encrypted');
    formData.append("originalName", file.name);
    
    // Include compression metadata if available
    if (encryptionResult.originalSize) {
      formData.append("originalSize", encryptionResult.originalSize);
    }
    if (encryptionResult.compressedSize) {
      formData.append("compressedSize", encryptionResult.compressedSize);
    }

    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = function (event) {
      let percent = Math.round((100 * event.loaded) / event.total);
      // Upload progress takes 30-100% of total progress (encryption was 0-30%)
      const totalProgress = 30 + Math.round(percent * 0.7);
      progressBar.style.width = `${totalProgress}%`;

      if (event.lengthComputable && uploadStartTime) {
        const currentTime = Date.now();
        const elapsedTimeInSeconds = (currentTime - uploadStartTime) / 1000;

        if (elapsedTimeInSeconds > 0) {
          const bytesLoaded = event.loaded;
          const totalBytes = event.total;
          const uploadSpeed = bytesLoaded / elapsedTimeInSeconds; // Bytes per second
          const remainingBytes = totalBytes - bytesLoaded;
          const etaInSeconds = remainingBytes / uploadSpeed;

          if (uploadSpeedEl) {
            uploadSpeedEl.innerText = formatSpeed(uploadSpeed);
          }
          if (uploadETAEl) {
            uploadETAEl.innerText = formatETA(etaInSeconds);
          }
        }
      }
    };

    xhr.upload.onerror = function () {
      showToast(`Error in upload: ${xhr.status}.`);
      fileInput.value = "";
    };

    xhr.onreadystatechange = function () {
      if (xhr.readyState == XMLHttpRequest.DONE) {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          // Replace server's key with our client-generated key in the URL
          response.file = response.file.replace(/#.*$/, '') + '#' + keyHex;
          onFileUploadSuccess(JSON.stringify(response));
        } else {
          let errorMessage = `Error processing file: ${xhr.status} ${xhr.statusText}`;
          let rayId = null;
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            if (errorResponse && errorResponse.error) {
              errorMessage = errorResponse.error;
            }
            if (errorResponse && errorResponse.rayId) {
              rayId = errorResponse.rayId;
            }
          } catch (e) {
            // Response was not JSON or no 'error' property, use default message
            console.error("Could not parse error response as JSON:", e);
          }
          
          // Show error modal for upload errors
          if (window.errorHandler && xhr.status >= 500) {
            const uploadError = new Error(errorMessage);
            window.errorHandler.showErrorModal(uploadError, {
              action: 'file_upload',
              httpStatus: xhr.status,
              serverRayId: rayId,
              responseText: xhr.responseText.substring(0, 500)
            }, {
              title: 'Upload Failed',
              message: errorMessage
            });
          } else {
            showToast(errorMessage);
          }
          // Reset UI
          uploadView.style.display = "block";
          progressView.style.display = "none";
          postUploadView.style.display = "none";
          if (fileInput) {
            fileInput.value = ""; // Clear the file input
          }
        }
      }
    };

    xhr.open("POST", "/api/files");
    uploadStartTime = Date.now(); // Record start time before sending
    xhr.send(formData);
    
  } catch (error) {
    console.error('Encryption error:', error);
    
    // Show error modal with copy functionality
    if (window.errorHandler) {
      window.errorHandler.showErrorModal(error, {
        action: 'file_encryption',
        fileSize: file.size,
        fileName: file.name
      }, {
        title: 'File Encryption Failed',
        message: 'Failed to encrypt your file. This might be due to browser memory limitations or a corrupted file. Please try again with a smaller file or refresh the page.'
      });
    } else {
      showToast('Failed to encrypt file. Please try again.');
    }
    
    // Reset UI
    uploadView.style.display = "block";
    progressView.style.display = "none";
    postUploadView.style.display = "none";
    if (fileInput) {
      fileInput.value = "";
    }
  }
};

const formatSpeed = (bytesPerSecond) => {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(2)} B/s`;
  } else if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
  } else {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
  }
};

const formatETA = (totalSeconds) => {
  if (isNaN(totalSeconds) || !isFinite(totalSeconds) || totalSeconds < 0) {
    return "Calculating...";
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (minutes > 0) {
    return `${minutes} min ${seconds} sec remaining`;
  } else if (seconds > 0) {
    return `${seconds} sec remaining`;
  } else {
    return "Almost done...";
  }
};


const onFileUploadSuccess = (res) => {
  fileInput.value = "";
  const { file: url, qr } = JSON.parse(res);
  fileURL.value = url;

  uploadView.style.display = "none";
  progressView.style.display = "none";
  postUploadView.style.display = "flex";
  statusText.innerText = "Upload completed!";
  if (qr) {
    qrImg.src = qr;

    setTimeout(() => {
      qrcode.style.display = "flex";
      const checkmark = document.querySelectorAll(".check-icon");
      checkmark.forEach((el) => (el.style.display = "none"));
    }, 2500);
  }

  setTimeout(() => {
    anims.forEach((el) => el.classList.add("fade-in"));
  }, 300);
};

copyURLBtn.addEventListener("click", () => {
  fileURL.select();
  document.execCommand("copy");
  showToast("Download link copied to clipboard");
});

fileURL.addEventListener("click", () => {
  fileURL.select();
});

emailBtn.addEventListener("click", () => {
  emailFormContainer.style.display = "flex";
});

emailForm.addEventListener("submit", (e) => {
  e.preventDefault(); // stop submission

  emailSendBtn.setAttribute("disabled", "disabled");
  emailSendBtn.innerHTML = "<span>Sending..</span>";

  const url = fileURL.value;

  const formData = {
    uuid: url.split("/").splice(-1, 1)[0].split("#")[0], // Remove encryption key from UUID
    recipient: emailForm.elements["mail_to"].value,
    sender: emailForm.elements["mail_from"].value,
    originalUrl: url, // Include the full URL with encryption key
  };

  fetch("/api/files/sendmail", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(formData),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        showToast("Email successfully sent");
        document.getElementById("emailTo").value = "";
        emailSendBtn.innerHTML = "<span>Send</span>";
        emailSendBtn.removeAttribute("disabled");
      } else {
        showToast("Something went wrong");
        emailSendBtn.innerHTML = "<span>Retry</span>";
        emailSendBtn.removeAttribute("disabled");
      }
    })
    .catch((error) => {
      console.error('Email send error:', error);
      
      if (window.errorHandler) {
        window.errorHandler.logError(error, {
          action: 'email_send',
          emailTo: document.getElementById("emailTo").value
        });
      }
      
      showToast("Something went wrong");
      emailSendBtn.innerHTML = "<span>Send</span>";
      emailSendBtn.removeAttribute("disabled");
    });
});

let toastTimer;
const showToast = (msg) => {
  clearTimeout(toastTimer);
  toast.innerText = msg;
  toast.classList.add("show");
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
};

goBackBtn.addEventListener("click", (e) => {
  window.location.href = "/";
});

// Copy Ray ID when clicking Synkros logo
if (logoBtn) {
  logoBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    const rayId = document.body.getAttribute("data-ray-id");
    if (rayId) {
      try {
        await navigator.clipboard.writeText(rayId);
        showToast("Ray ID copied to clipboard");
      } catch (err) {
        // Fallback for older browsers
        const tempInput = document.createElement("input");
        tempInput.value = rayId;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showToast("Ray ID copied to clipboard");
      }
    }
  });
}
