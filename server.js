require("dotenv").config();

const express = require("express");
const qs = require("qs");
const { urlencoded, json } = require("express");
const path = require("path");
const favicon = require("serve-favicon");
const client = require("twilio")(
    process.env.ACCOUNT_SID,
    process.env.AUTH_TOKEN
);
const { nanoid } = require("nanoid");

const chatUtil = require("./utilities/chatUtil");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const PORT = process.env.PORT || 3000;

//session chats
const chats = {};

app.use(
    urlencoded({
        extended: true,
    })
);

app.use(json());

app.set("view engine", "ejs");
app.use(favicon(path.join(__dirname, "public", "images", "favicon.ico")));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
    res.render("lobby");
});

app.get("/room", async (req, res) => {
    const roomId = req.query.roomId;
    const name = req.query.name;
    try {
        if (!name || !roomId) {
            throw new Error("Invalid entry");
        }
        if (chats[roomId] === undefined) {
            throw new Error("Illegal Entry");
        }
        token = await client.tokens.create();
        const response = token.iceServers;
        res.render("room", {
            roomId: roomId,
            name: name,
            iceServers: response,
            chats: chats[roomId],
        });
    } catch (err) {
        if (err.message === "Illegal Entry") res.redirect("/");
        else res.send(err);
    }
});

app.post("/createRoom", (_req, res) => {
    const roomId = nanoid();
    chats[roomId] = [];
    res.json({
        status: "success",
        roomId: roomId,
    });
});

app.post("/joinRoom", (req, res) => {
    const name = req.body.name;
    const roomId = req.body.roomId;
    try {
        if (chats[roomId] === undefined) {
            throw new Error("Room ID invalid");
        }

        const query = qs.stringify({
            name: name,
            roomId: roomId,
        });
        const url = "/room/?" + query;
        res.json({
            status: "success",
            body: url,
        });
    } catch (err) {
        res.json({
            status: "error",
            body: err.message,
        });
    }
});

//Handle web-socket events
io.on("connection", (socket) => {
    socket.on("join-room", (roomId, userId, userName) => {
        socket.join(roomId);

        socket.to(roomId).emit("user-connected", userId);

        const joinAlert = {
            sender: "Admin",
            body: `${userName} has joined`,
            date: chatUtil.getUTCDate(),
            control: 1,
        };
        io.to(roomId).emit("create-message", joinAlert);
        chats[roomId] = [...chats[roomId], joinAlert];
        chatUtil.chatCleanup(chats[roomId]);

        socket.on("message", (message) => {
            message["date"] = chatUtil.getUTCDate();
            message["control"] = 0;
            io.to(roomId).emit("create-message", message);
            chats[roomId] = [...chats[roomId], message];
            chatUtil.chatCleanup(chats[roomId]);
        });

        socket.on("disconnect", () => {
            socket.to(roomId).emit("user-disconnected", userId);

            const leaveAlert = {
                sender: "Admin",
                body: `${userName} has left`,
                date: chatUtil.getUTCDate(),
                control: 2,
            };
            io.to(roomId).emit("create-message", leaveAlert);
            chats[roomId] = [...chats[roomId], leaveAlert];
            chatUtil.chatCleanup(chats[roomId]);
        });
    });
});

app.get("*", (_req, res) => {
    res.redirect("/");
});

server.listen(PORT, () => {
    console.log("Server is running");
});
