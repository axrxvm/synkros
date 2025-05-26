const router = require('express').Router();
const File = require('../models/file');
const crypto = require('crypto');
const fs = require('fs');

router.get('/:uuid', async (req, res) => {
  try {
    const file = await File.findOne({
      uuid: req.params.uuid
    });

    if (!file) {
      return res.render('download', {
        error: 'Incorrect file link'
      });
    }

    const encryptionKey = process.env.KEY;
    if (!encryptionKey || Buffer.from(encryptionKey).length !== 32) {
      console.error("Server decryption key not configured correctly.");
      return res.render('download', {
        error: 'Server error: Decryption key issue. Please contact administrator.'
      });
    }

    const filePath = `${__dirname}/../${file.path}`;

    // Decryption Process
    const encryptedFileBuffer = fs.readFileSync(filePath);
    const iv = encryptedFileBuffer.slice(0, 16);
    const ciphertext = encryptedFileBuffer.slice(16);

    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(encryptionKey), iv);
    const decryptedBuffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Send Decrypted Data
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream'); // Generic content type
    res.setHeader('Content-Length', decryptedBuffer.length);
    res.send(decryptedBuffer);

  } catch (error) {
    console.error("Error during file download/decryption:", error);
    // Check if the error is due to file not found after already checking for file in DB
    if (error.code === 'ENOENT') {
        return res.render('download', { error: 'File not found on server.' });
    }
    return res.render('download', {
      error: 'Error processing file for download. The file might be corrupted or the server key is incorrect.'
    });
  }
});

module.exports = router;