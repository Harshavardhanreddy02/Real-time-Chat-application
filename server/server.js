import express from "express";
import "dotenv/config";
import cors from "cors";
import http from "http";
import { connectDB } from "./lib/db.js";
import userRouter from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import { Server } from "socket.io";

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app)

// Initialize socket.io server with Vercel-optimized configuration
export const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for Vercel compatibility
        methods: ["GET", "POST"],
        credentials: false, // Set to false for broader compatibility
        allowEIO3: true
    },
    allowEIO3: true,
    transports: ['polling'], // Force polling-only for Vercel serverless
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e6
})

// Store online users and typing users
export const userSocketMap = {}; // { userId: socketId }
export const typingUsers = {}; // { userId: { typingTo: receiverId, timeout: timeoutId } }

// Socket.io connection handler
io.on("connection", (socket)=>{
    const userId = socket.handshake.query.userId;
    console.log("User Connected", userId);

    if(userId) userSocketMap[userId] = socket.id;
    
    // Emit online users to all connected clients
    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    // Handle typing events
    socket.on("typing", ({ receiverId }) => {
        console.log(`Typing event received: ${userId} typing to ${receiverId}`);
        if (userId && receiverId) {
            // Clear existing timeout if any
            if (typingUsers[userId]?.timeout) {
                clearTimeout(typingUsers[userId].timeout);
            }
            
            // Set typing status
            typingUsers[userId] = { 
                typingTo: receiverId,
                timeout: setTimeout(() => {
                    console.log(`Auto-stopping typing for user ${userId}`);
                    delete typingUsers[userId];
                    // Notify receiver that typing stopped
                    const receiverSocketId = userSocketMap[receiverId];
                    if (receiverSocketId) {
                        io.to(receiverSocketId).emit("userStoppedTyping", { userId });
                    }
                }, 3000) // Auto-stop after 3 seconds
            };
            
            // Notify receiver that user is typing
            const receiverSocketId = userSocketMap[receiverId];
            console.log(`Receiver socket ID for ${receiverId}: ${receiverSocketId}`);
            if (receiverSocketId) {
                console.log(`Emitting userTyping to ${receiverId}`);
                io.to(receiverSocketId).emit("userTyping", { userId });
            } else {
                console.log(`Receiver ${receiverId} not found in userSocketMap`);
            }
        }
    });

    socket.on("stopTyping", ({ receiverId }) => {
        console.log(`Stop typing event received: ${userId} stopped typing to ${receiverId}`);
        if (userId && typingUsers[userId]) {
            // Clear timeout
            if (typingUsers[userId].timeout) {
                clearTimeout(typingUsers[userId].timeout);
            }
            delete typingUsers[userId];
            
            // Notify receiver that typing stopped
            const receiverSocketId = userSocketMap[receiverId];
            if (receiverSocketId) {
                console.log(`Emitting userStoppedTyping to ${receiverId}`);
                io.to(receiverSocketId).emit("userStoppedTyping", { userId });
            }
        }
    });

    socket.on("disconnect", ()=>{
        console.log("User Disconnected", userId);
        
        // Clean up typing status
        if (typingUsers[userId]) {
            const { typingTo, timeout } = typingUsers[userId];
            if (timeout) clearTimeout(timeout);
            delete typingUsers[userId];
            
            // Notify receiver that user stopped typing
            const receiverSocketId = userSocketMap[typingTo];
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("userStoppedTyping", { userId });
            }
        }
        
        delete userSocketMap[userId];
        io.emit("getOnlineUsers", Object.keys(userSocketMap))
    })
})

// Middleware setup
app.use(express.json({limit: "4mb"}));

// CORS configuration - Allow all origins for now to debug
app.use(cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'token', 'X-Requested-With'],
    preflightContinue: false,
    optionsSuccessStatus: 200
}));

// Ultra-aggressive CORS headers - apply to ALL requests
app.use((req, res, next) => {
    const origin = req.headers.origin;
    console.log('v3.0 - Request from origin:', origin, 'Method:', req.method);
    
    // Set all possible CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, token');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '3600');
    
    // Handle preflight requests immediately
    if (req.method === 'OPTIONS') {
        console.log('v3.0 - Handling OPTIONS preflight from:', origin);
        res.status(200).json({});
        return;
    }
    
    next();
});


// Routes setup
app.use("/api/status", (req, res)=> res.send("Server is live - v3.2 - Vercel-optimized Socket.IO"));
app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter)


// Connect to MongoDB
await connectDB();

if(process.env.NODE_ENV !== "production"){
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, ()=> console.log("Server is running on PORT: " + PORT));
}

// Export server for Vervel
export default server;
