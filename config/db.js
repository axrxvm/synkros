require("dotenv").config();
const mongoose = require("mongoose");

function connectDB() {
  const connectionString = process.env.MONGODB_CONNECTION_URL;
  mongoose.connect(connectionString);

  const connection = mongoose.connection;

  connection.on("error", (err) => {
    console.error("Database connection failed:", err);
    process.exit(1);
  });

  connection.once("open", () => {
    console.log("Database connected");
  });
}

module.exports = connectDB;
