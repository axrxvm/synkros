const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');

// --- Configuration ---
const SAMPLE_FILE_NAME = 'sample-test-file.txt';
const SAMPLE_FILE_CONTENT = 'This is a test file for encryption and decryption! Hello World! 12345_&*().';
const BASE_URL = 'http://localhost:3000'; // Ensure your server is running here
const UPLOAD_ENDPOINT = `${BASE_URL}/files`;
// KEY should be set in the environment where this script and the server run.
// e.g., export KEY=YourSecretKeyForTesting123456789
if (!process.env.KEY || Buffer.from(process.env.KEY).length !== 32) {
    console.error("FATAL: process.env.KEY is not set or is not 32 bytes long.");
    console.error("Please set it before running the test, e.g., export KEY=YourSecretKeyForTesting123456789");
    process.exit(1);
}

let uploadedFileUUID = null;
// Store the server-side path if we can get it (future improvement)
// let serverFilePath = null; 

async function runTests() {
    console.log("Starting encryption/decryption tests...");
    console.log("IMPORTANT: Ensure the server is running and process.env.KEY is set correctly.");
    console.log("Using KEY:", "****" + process.env.KEY.slice(-4)); // Mask part of the key

    try {
        // 1. Setup: Create sample file
        console.log(`\n[SETUP] Creating sample file: ${SAMPLE_FILE_NAME}`);
        await fs.writeFile(SAMPLE_FILE_NAME, SAMPLE_FILE_CONTENT);
        console.log("Sample file created successfully.");

        // 2. Upload Test
        console.log(`\n[UPLOAD TEST] Uploading ${SAMPLE_FILE_NAME} to ${UPLOAD_ENDPOINT}`);
        const formData = new FormData();
        formData.append('myFile', await fs.readFile(SAMPLE_FILE_NAME), SAMPLE_FILE_NAME);
        
        const uploadResponse = await axios.post(UPLOAD_ENDPOINT, formData, {
            headers: formData.getHeaders(),
        });

        if (uploadResponse.status !== 200 || !uploadResponse.data.file) {
            throw new Error(`Upload failed. Status: ${uploadResponse.status}, Response: ${JSON.stringify(uploadResponse.data)}`);
        }
        const fileUrl = uploadResponse.data.file;
        uploadedFileUUID = fileUrl.split('/').pop();
        console.log(`Upload successful. File URL: ${fileUrl}, UUID: ${uploadedFileUUID}`);
        
        // serverFilePath = uploadResponse.data.path; // If server were to return this

        // Basic Verification (Skipped for now, as server doesn't return path)
        // console.log("[UPLOAD VERIFICATION] Checking if file on disk is different...");
        // if (serverFilePath) {
        // const uploadedContent = await fs.readFile(serverFilePath);
        // if (Buffer.compare(Buffer.from(SAMPLE_FILE_CONTENT), uploadedContent) === 0) {
        // throw new Error("Uploaded file content is identical to original; encryption may have failed.");
        // }
        // console.log("File content on disk is different from original (basic encryption check passed).");
        // } else {
        // console.log("Skipping direct on-disk encrypted file verification (server_file_path not available from upload response).");
        // }


        // 3. Download Test
        if (!uploadedFileUUID) {
            throw new Error("Cannot proceed to download test, UUID not found from upload.");
        }
        const downloadUrl = `${BASE_URL}/files/${uploadedFileUUID}`;
        console.log(`\n[DOWNLOAD TEST] Downloading file from ${downloadUrl}`);
        
        const downloadResponse = await axios.get(downloadUrl, {
            responseType: 'arraybuffer', // Important to get binary data correctly
        });

        if (downloadResponse.status !== 200) {
            throw new Error(`Download failed. Status: ${downloadResponse.status}`);
        }
        const downloadedData = downloadResponse.data;
        console.log("Download successful.");

        // 4. Verification (Crucial)
        console.log("\n[DOWNLOAD VERIFICATION] Comparing downloaded file with original...");
        const originalBuffer = Buffer.from(SAMPLE_FILE_CONTENT);
        const downloadedBuffer = Buffer.from(downloadedData);

        if (Buffer.compare(originalBuffer, downloadedBuffer) !== 0) {
            console.error("Original content:", originalBuffer.toString('hex'));
            console.error("Downloaded content:", downloadedBuffer.toString('hex'));
            // For text files, also show as string for easier debugging
            if (!SAMPLE_FILE_NAME.endsWith('.png') && !SAMPLE_FILE_NAME.endsWith('.jpg')) { // simple check
                 console.error("Original string:", originalBuffer.toString());
                 console.error("Downloaded string:", downloadedBuffer.toString());
            }
            throw new Error("Verification failed: Downloaded file content does not match original.");
        }
        console.log("Verification successful: Downloaded file matches original content!");

        console.log("\nAll tests passed successfully!");

    } catch (error) {
        console.error("\n--- TEST FAILED ---");
        console.error("Error:", error.message);
        if (error.response && error.response.data) {
            // Log server error if available
             try {
                // Attempt to parse if it's JSON, otherwise print as is.
                const errorData = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
                console.error("Server Response:", errorData);
            } catch(e) { // Handle cases where error.response.data is a Buffer or complex object
                 console.error("Server Response (raw):", error.response.data.toString());
            }
        }
        // console.error("Stack:", error.stack);
        process.exitCode = 1; // Indicate failure
    } finally {
        // 5. Cleanup
        console.log("\n[CLEANUP]");
        try {
            console.log(`Deleting sample file: ${SAMPLE_FILE_NAME}`);
            await fs.unlink(SAMPLE_FILE_NAME);
            console.log("Sample file deleted.");
        } catch (err) {
            console.warn(`Warning: Could not delete sample file ${SAMPLE_FILE_NAME}. ${err.message}`);
        }

        // Cleanup for uploaded file on server (Skipped for now)
        // if (serverFilePath) {
        // try {
        // console.log(`Deleting uploaded file on server: ${serverFilePath}`);
        // await fs.unlink(serverFilePath); // This would require the test to run on the server or have API to do so
        // console.log("Uploaded file deleted from server.");
        // } catch (err) {
        // console.warn(`Warning: Could not delete server file ${serverFilePath}. ${err.message}`);
        // }
        // } else if (uploadedFileUUID) {
        // console.log("Skipping cleanup of uploaded file on server (server_file_path not available). Manual cleanup in 'uploads/' might be needed.");
        // }
        console.log("Cleanup phase finished.");
    }
}

runTests();

console.log("\n---");
console.log("NOTE: This test script requires 'axios' and 'form-data'.");
console.log("Install them if you haven't: npm install --save-dev axios form-data");
console.log("Ensure the application server is running and KEY environment variable is set.");
console.log("---");
