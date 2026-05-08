import mongoose from "mongoose";

mongoose.connect(process.env.MONGO_URL || "mongodb://localhost:27017/ecommerce");