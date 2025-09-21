const express = require("express");
const http = require("http");
const cron = require("node-cron");
const app = express();
require("dotenv").config();
const path = require("path");
const cors = require("cors");

const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: process.env.ALLOWED_CLIENTS.split(","),
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.static("public"));
app.set("views", path.join(__dirname, "/views"));
app.set("view engine", "ejs");

app.use("/", require("./routes/home"));
app.use("/uploaded-files", require("./routes/listing"));
app.use("/cleanup", require("./routes/cleanup"));
app.use("/api/files", require("./routes/files"));
app.use("/files", require("./routes/filePreview"));
app.use("/files/download", require("./routes/download"));
app.get('/privacy', (req, res) => { res.render('privacy'); });
app.get('/tos', (req, res) => { res.render('tos'); });
app.get("/report", (req, res) => { res.render("abuse"); });
app.get("/license", (req, res) => { res.render("license"); });


const server = app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`⏰ Auto-cleanup scheduled to run daily at midnight (cron: "0 0 * * *")`);
  console.log(`🧹 Cleanup time limit: ${require('./constants/file-constants').cleanupTimeLimit / (60 * 60 * 1000)} hours`);
  console.log(`🔧 Manual cleanup available at: http://localhost:${PORT}/trigger-cleanup`);
});

// Function to trigger cleanup manually or via cron
async function triggerCleanup() {
  console.log("Triggering cleanup at", new Date().toISOString());
  
  try {
    // Make internal request to cleanup endpoint
    const options = {
      hostname: "localhost",
      port: PORT,
      path: "/cleanup",
      method: "GET",
    };

    const req = http.request(options, (res) => {
      console.log(`Cleanup completed with status: ${res.statusCode}`);
      
      let responseData = '';
      res.on("data", (chunk) => {
        responseData += chunk;
      });
      
      res.on("end", () => {
        if (res.statusCode === 200) {
          console.log("Cleanup executed successfully");
        } else {
          console.error("Cleanup failed with response:", responseData);
        }
      });
    });

    req.on("error", (error) => {
      console.error("Error running cleanup:", error);
    });

    req.setTimeout(30000, () => {
      console.error("Cleanup request timed out");
      req.destroy();
    });

    req.end();
  } catch (error) {
    console.error("Failed to trigger cleanup:", error);
  }
}

// Schedule cron job for cleanup - runs daily at midnight
cron.schedule("0 0 * * *", async () => {
  console.log("Running scheduled cleanup cron job");
  await triggerCleanup();
});
