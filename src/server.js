const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const Plan = require("./models/Plan");
const userRoutes = require("./routes/userRoutes");
const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const promotionRoutes = require("./routes/promotionRoutes");
const storeRoutes = require("./routes/storeRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const faqRoutes = require("./routes/faqRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const statsRoutes = require("./routes/statsRoutes");

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {})
  .then(() => {
    console.log("MongoDB connected successfully");
    initializePlans();
  })
  .catch((err) => console.error("MongoDB connection error:", err.message));

// Routes
app.get("/", (req, res) => {
  res.status(200).send("Welcome to the server");
});

app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/faqs", faqRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/stats", statsRoutes);

// Global Error-Handling Middleware
app.use((err, req, res, next) => {
  console.error("Error:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
  });
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
    status: err.status || 500,
  });
});

const initializePlans = async () => {
  try {
    const defaultPlans = [
      { type: "reseller", tier: "tier1", amount: 10, duration: 30 },
      { type: "reseller", tier: "tier2", amount: 20, duration: 90 },
      { type: "reseller", tier: "tier3", amount: 30, duration: 180 },
      { type: "store_owner", tier: "tier1", amount: 10, duration: 30 },
      { type: "store_owner", tier: "tier2", amount: 20, duration: 90 },
      { type: "store_owner", tier: "tier3", amount: 30, duration: 180 },
    ];

    for (const plan of defaultPlans) {
      const exists = await Plan.findOne({ type: plan.type, tier: plan.tier });
      if (!exists) {
        await new Plan({ _id: uuidv4(), ...plan }).save();
        console.log(`Initialized ${plan.type} ${plan.tier} plan`);
      }
    }
  } catch (error) {
    console.error("Failed to initialize plans:", error);
  }
};

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
