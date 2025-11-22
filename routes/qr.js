const express = require("express");
const QRCode = require("qrcode");
const logger = require("../services/logger");

const router = express.Router();

/**
 * POST /api/qr
 * Generate QR code for a given URL
 * 
 * Request body:
 * - url: string (required) - The URL to encode in the QR code
 * - size: number (optional) - QR code size in pixels (default: 200)
 * - color: string (optional) - Dark color (default: #4c8bf4)
 * - bgColor: string (optional) - Light/background color (default: #ffffff)
 * - format: string (optional) - Output format: 'png' or 'svg' (default: 'png')
 * 
 * Response:
 * - For PNG: Base64 data URL
 * - For SVG: SVG string
 */
router.post("/", async (req, res) => {
  try {
    const { url, size = 200, color = "#4c8bf4", bgColor = "#202124", format = "png" } = req.body;

    // Validate URL
    if (!url || typeof url !== "string") {
      return res.status(400).json({
        error: "URL is required and must be a string",
        rayId: req.rayId
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({
        error: "Invalid URL format",
        rayId: req.rayId
      });
    }

    // Validate size
    const qrSize = parseInt(size);
    if (isNaN(qrSize) || qrSize < 50 || qrSize > 1000) {
      return res.status(400).json({
        error: "Size must be between 50 and 1000 pixels",
        rayId: req.rayId
      });
    }

    // QR code options
    const options = {
      width: qrSize,
      margin: 2,
      color: {
        dark: color,
        light: bgColor
      },
      errorCorrectionLevel: "M"
    };

    let qrData;

    if (format === "svg") {
      // Generate SVG
      qrData = await QRCode.toString(url, {
        ...options,
        type: "svg"
      });
      
      return res.json({
        success: true,
        format: "svg",
        data: qrData,
        rayId: req.rayId
      });
    } else {
      // Generate PNG as data URL
      qrData = await QRCode.toDataURL(url, options);
      
      return res.json({
        success: true,
        format: "png",
        data: qrData, // Base64 data URL
        rayId: req.rayId
      });
    }

  } catch (error) {
    logger.error("QR code generation failed", req, error);
    return res.status(500).json({
      error: "Failed to generate QR code",
      rayId: req.rayId
    });
  }
});

/**
 * GET /api/qr
 * Generate QR code for a URL passed as query parameter
 * Returns PNG image directly
 * 
 * Query params:
 * - url: string (required)
 * - size: number (optional, default: 200)
 * - color: string (optional, default: #4c8bf4)
 * - bgColor: string (optional, default: #ffffff)
 */
router.get("/", async (req, res) => {
  try {
    const { url, size = "200", color = "#4c8bf4", bgColor = "#202124" } = req.query;

    // Validate URL
    if (!url) {
      return res.status(400).json({
        error: "URL query parameter is required",
        rayId: req.rayId
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({
        error: "Invalid URL format",
        rayId: req.rayId
      });
    }

    // Validate size
    const qrSize = parseInt(size);
    if (isNaN(qrSize) || qrSize < 50 || qrSize > 1000) {
      return res.status(400).json({
        error: "Size must be between 50 and 1000 pixels",
        rayId: req.rayId
      });
    }

    // QR code options
    const options = {
      width: qrSize,
      margin: 2,
      color: {
        dark: color,
        light: bgColor
      },
      errorCorrectionLevel: "M"
    };

    // Generate PNG buffer
    const qrBuffer = await QRCode.toBuffer(url, options);
    
    // Set headers and send image
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", qrBuffer.length);
    res.setHeader("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
    res.send(qrBuffer);

  } catch (error) {
    logger.error("QR code generation failed", req, error);
    return res.status(500).json({
      error: "Failed to generate QR code",
      rayId: req.rayId
    });
  }
});

module.exports = router;
