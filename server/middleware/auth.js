import User from "../models/User.js";
import jwt from "jsonwebtoken";

// Middleware to protect routes
export const protectRoute = async (req, res, next)=>{
    try {
        // Check for token in multiple places
        let token = req.headers.token || req.headers.authorization;
        
        // Handle Bearer token format
        if (token && token.startsWith('Bearer ')) {
            token = token.slice(7);
        }

        if (!token) {
            return res.status(401).json({ success: false, message: "jwt must be provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.userId).select("-password");

        if(!user) return res.status(404).json({ success: false, message: "User not found" });

        req.user = user;
        next();
    } catch (error) {
        console.log("Auth middleware error:", error.message);
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: "Invalid token" });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: "Token expired" });
        }
        res.status(500).json({ success: false, message: "Authentication failed" });
    }
}