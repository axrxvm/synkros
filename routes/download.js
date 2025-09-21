const router = require('express').Router();
const { getFileMetadata } = require('../models/file');
const fs = require('fs');

// E2EE Download endpoint - serves encrypted file directly for client-side decryption
router.get('/:uuid', async (req, res) => {
  try {
    const file = await getFileMetadata(req.params.uuid);

    if (!file) {
      return res.status(404).json({
        error: 'File not found'
      });
    }

    const filePath = `${__dirname}/../${file.path}`;

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found on server'
      });
    }

    // Send encrypted file directly - client will decrypt
    const encryptedFileBuffer = fs.readFileSync(filePath);
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', encryptedFileBuffer.length);
    res.setHeader('X-Original-Filename', file.originalName || file.filename);
    res.setHeader('Access-Control-Expose-Headers', 'X-Original-Filename');
    
    res.send(encryptedFileBuffer);

  } catch (error) {
    console.error("Error during file download:", error);
    return res.status(500).json({
      error: 'Error processing file for download'
    });
  }
});

module.exports = router;