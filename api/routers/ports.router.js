import express from "express";
import { getPortInfo, groupPort } from "../controllers/ports.controller.js";

const router = express.Router();

// GET /ports?port=8080
// GET /ports/group
router.get("/", getPortInfo);
router.get("/group", groupPort);

export default router;