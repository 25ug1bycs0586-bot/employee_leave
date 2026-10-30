require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const cors = require("cors");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { LocalModel, initialize: initializeStore } = require("./local-store");

const app = express();
const PORT = Number(process.env.PORT) || 3001;
let JWT_SECRET = process.env.JWT_SECRET;
const uploadDirectory = path.join(__dirname, "uploads");
const dataDirectory = path.join(__dirname, "data");

fs.mkdirSync(uploadDirectory, { recursive: true });

const balanceDefaults = {
  casual: 12,
  sick: 10,
  earned: 15,
  maternity: 90,
  paternity: 10,
};

const User = new LocalModel("users", {
  role: "employee",
  phone: "",
  isActive: true,
  balances: balanceDefaults,
}, ["email", "employeeId"]);
const Leave = new LocalModel("leaves", {
  status: "pending",
  documentFilename: "",
  documentOriginalName: "",
  reviewer: null,
  reviewerNote: "",
});
const Department = new LocalModel("departments", {}, ["name"]);

const leaveLabels = {
  casual: "Casual Leave",
  sick: "Sick Leave",
  earned: "Earned Leave",
  maternity: "Maternity Leave",
  paternity: "Paternity Leave",
  unpaid: "Unpaid Leave",
};

const safeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  employeeId: user.employeeId,
  department: user.department,
  role: user.role,
  phone: user.phone,
  balances: user.balances,
  isActive: user.isActive,
  createdAt: user.createdAt,
});

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const authRequired = asyncRoute(async (req, res, next) => {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "Please sign in to continue." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) return res.status(401).json({ message: "Your account is unavailable." });
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Your session has expired. Please sign in again." });
    }
    throw error;
  }
});

const adminRequired = (req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "HR administrator access is required." });
  next();
};

const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const leaveDayCount = (startDate, endDate) =>
  Math.floor((Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) -
    Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())) /
    86400000) + 1;
const parseDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(["application/pdf", "image/png", "image/jpeg"]);
    if (!allowed.has(file.mimetype)) return callback(new Error("Only PDF, PNG, and JPEG documents are supported."));
    callback(null, true);
  },
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: "same-site" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
}));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false }));

app.get("/api/health", (_req, res) => res.json({ status: "ok", storage: "local-file" }));

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const name = normalizeText(req.body.name);
  const email = normalizeText(req.body.email).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const department = normalizeText(req.body.department);
  if (name.length < 2 || !validEmail(email) || password.length < 8 || department.length < 2) {
    return res.status(400).json({ message: "Enter a name, valid email, password with at least 8 characters, and department." });
  }
  const knownDepartment = await Department.findOne({ name: department });
  if (!knownDepartment) return res.status(400).json({ message: "Choose an available department." });
  if (await User.exists({ email })) return res.status(409).json({ message: "An account with this email already exists." });

  const user = await User.create({
    name,
    email,
    password: await bcrypt.hash(password, 12),
    employeeId: `EMP-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    department: knownDepartment.name,
  });
  res.status(201).json({ token: signToken(user), user: safeUser(user) });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const email = normalizeText(req.body.email).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const user = await User.findOne({ email }).select("+password");
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Email or password is incorrect." });
  }
  res.json({ token: signToken(user), user: safeUser(user) });
}));

app.get("/api/public/departments", asyncRoute(async (_req, res) => {
  const departments = await Department.find().sort({ name: 1 }).select("name").lean();
  res.json({ departments });
}));

app.use("/api", authRequired);

app.get("/api/me", (req, res) => res.json({ user: safeUser(req.user) }));
app.patch("/api/me", asyncRoute(async (req, res) => {
  const name = normalizeText(req.body.name);
  const email = normalizeText(req.body.email).toLowerCase();
  const phone = normalizeText(req.body.phone);
  if (name.length < 2 || !validEmail(email) || phone.length > 30) {
    return res.status(400).json({ message: "Enter a valid name, email, and phone number." });
  }
  if (await User.exists({ email, _id: { $ne: req.user._id } })) {
    return res.status(409).json({ message: "That email is already in use." });
  }
  req.user.name = name;
  req.user.email = email;
  req.user.phone = phone;
  await req.user.save();
  res.json({ user: safeUser(req.user) });
}));

app.get("/api/dashboard", asyncRoute(async (req, res) => {
  const ownFilter = req.user.role === "admin" ? {} : { user: req.user._id };
  const [totalEmployees, totalRequests, pending, approved, rejected, recent] = await Promise.all([
    req.user.role === "admin" ? User.countDocuments({ role: "employee", isActive: true }) : Promise.resolve(0),
    Leave.countDocuments(ownFilter),
    Leave.countDocuments({ ...ownFilter, status: "pending" }),
    Leave.countDocuments({ ...ownFilter, status: "approved" }),
    Leave.countDocuments({ ...ownFilter, status: "rejected" }),
    Leave.find(ownFilter).sort({ createdAt: -1 }).limit(6).lean(),
  ]);
  res.json({
    summary: { totalEmployees, totalRequests, pending, approved, rejected },
    recent,
    user: safeUser(req.user),
  });
}));

app.get("/api/leaves", asyncRoute(async (req, res) => {
  const query = {};
  if (req.user.role !== "admin") query.user = req.user._id;
  if (req.query.status && ["pending", "approved", "rejected", "cancelled"].includes(req.query.status)) {
    query.status = req.query.status;
  }
  if (req.user.role === "admin") {
    if (typeof req.query.employeeId === "string" && req.query.employeeId.trim()) {
      query.employeeId = req.query.employeeId.trim();
    }
    if (typeof req.query.department === "string" && req.query.department.trim()) {
      query.department = req.query.department.trim();
    }
    if (typeof req.query.from === "string" && parseDate(req.query.from)) query.endDate = { $gte: parseDate(req.query.from) };
    if (typeof req.query.to === "string" && parseDate(req.query.to)) {
      query.startDate = { $lte: parseDate(req.query.to) };
    }
  }
  const leaves = await Leave.find(query).sort({ createdAt: -1 }).limit(500).lean();
  res.json({ leaves });
}));

app.post("/api/leaves", upload.single("document"), asyncRoute(async (req, res) => {
  const leaveType = normalizeText(req.body.leaveType).toLowerCase();
  const startDate = parseDate(req.body.startDate);
  const endDate = parseDate(req.body.endDate);
  const reason = normalizeText(req.body.reason);
  if (!Object.hasOwn(leaveLabels, leaveType) || !startDate || !endDate || endDate < startDate || reason.length < 3) {
    if (req.file) await fs.promises.unlink(req.file.path);
    return res.status(400).json({ message: "Check the leave type, dates, and reason, then try again." });
  }
  let leave;
  try {
    leave = await Leave.create({
      user: req.user._id,
      employeeId: req.user.employeeId,
      employeeName: req.user.name,
      department: req.user.department,
      leaveType,
      startDate,
      endDate,
      days: leaveDayCount(startDate, endDate),
      reason,
      documentFilename: req.file?.filename || "",
      documentOriginalName: req.file?.originalname || "",
    });
  } catch (error) {
    if (req.file) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") console.error("Could not remove a failed leave attachment:", cleanupError);
      }
    }
    throw error;
  }
  res.status(201).json({ leave });
}));

app.patch("/api/leaves/:id", asyncRoute(async (req, res) => {
  if (!LocalModel.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid leave request." });
  const leave = await Leave.findById(req.params.id);
  if (!leave) return res.status(404).json({ message: "Leave request not found." });

  if (req.user.role !== "admin") {
    if (String(leave.user) !== String(req.user._id)) return res.status(404).json({ message: "Leave request not found." });
    if (req.body.status !== "cancelled" || leave.status !== "pending") {
      return res.status(400).json({ message: "Only pending requests can be cancelled." });
    }
    leave.status = "cancelled";
    await leave.save();
    return res.json({ leave });
  }

  const status = req.body.status;
  if (!["approved", "rejected"].includes(status) || leave.status !== "pending") {
    return res.status(400).json({ message: "Only pending requests can be approved or rejected." });
  }
  const reviewerNote = normalizeText(req.body.reviewerNote);
  if (status === "rejected" && !reviewerNote) {
    return res.status(400).json({ message: "Add a short reason when rejecting a request." });
  }
  if (status === "approved" && leave.leaveType !== "unpaid") {
    const balanceField = `balances.${leave.leaveType}`;
    const updatedUser = await User.findOneAndUpdate(
      { _id: leave.user, [balanceField]: { $gte: leave.days }, isActive: true },
      { $inc: { [balanceField]: -leave.days } },
      { new: true }
    );
    if (!updatedUser) return res.status(409).json({ message: "The employee does not have enough leave balance." });
  }

  const updatedLeave = await Leave.findOneAndUpdate(
    { _id: leave._id, status: "pending" },
    { $set: { status, reviewer: req.user._id, reviewerNote } },
    { new: true }
  );
  if (!updatedLeave) {
    if (status === "approved" && leave.leaveType !== "unpaid") {
      await User.updateOne({ _id: leave.user }, { $inc: { [`balances.${leave.leaveType}`]: leave.days } });
    }
    return res.status(409).json({ message: "This request was already reviewed." });
  }
  res.json({ leave: updatedLeave });
}));

app.get("/api/employees", authRequired, adminRequired, asyncRoute(async (_req, res) => {
  const employees = await User.find({ role: "employee", isActive: true }).sort({ name: 1 });
  res.json({ employees: employees.map(safeUser) });
}));

app.post("/api/employees", authRequired, adminRequired, asyncRoute(async (req, res) => {
  const name = normalizeText(req.body.name);
  const email = normalizeText(req.body.email).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const department = normalizeText(req.body.department);
  const phone = normalizeText(req.body.phone);
  if (name.length < 2 || !validEmail(email) || password.length < 8 || phone.length > 30) {
    return res.status(400).json({ message: "Enter a valid name, email, phone number, and temporary password (8+ characters)." });
  }
  const knownDepartment = await Department.findOne({ name: department });
  if (!knownDepartment) return res.status(400).json({ message: "Choose an available department." });
  if (await User.exists({ email })) return res.status(409).json({ message: "That email is already in use." });
  const employee = await User.create({
    name, email, phone, department: knownDepartment.name,
    employeeId: `EMP-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    password: await bcrypt.hash(password, 12),
  });
  res.status(201).json({ employee: safeUser(employee) });
}));

app.patch("/api/employees/:id", authRequired, adminRequired, asyncRoute(async (req, res) => {
  if (!LocalModel.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid employee." });
  const employee = await User.findOne({ _id: req.params.id, role: "employee", isActive: true });
  if (!employee) return res.status(404).json({ message: "Employee not found." });
  if (req.body.name !== undefined) {
    const name = normalizeText(req.body.name);
    if (name.length < 2) return res.status(400).json({ message: "Employee name must be at least 2 characters." });
    employee.name = name;
  }
  if (req.body.email !== undefined) {
    const email = normalizeText(req.body.email).toLowerCase();
    if (!validEmail(email)) return res.status(400).json({ message: "Enter a valid email address." });
    if (await User.exists({ email, _id: { $ne: employee._id } })) return res.status(409).json({ message: "That email is already in use." });
    employee.email = email;
  }
  if (req.body.phone !== undefined) employee.phone = normalizeText(req.body.phone).slice(0, 30);
  if (req.body.department !== undefined) {
    const department = await Department.findOne({ name: normalizeText(req.body.department) });
    if (!department) return res.status(400).json({ message: "Choose an available department." });
    employee.department = department.name;
  }
  await employee.save();
  res.json({ employee: safeUser(employee) });
}));

app.delete("/api/employees/:id", authRequired, adminRequired, asyncRoute(async (req, res) => {
  if (!LocalModel.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid employee." });
  const employee = await User.findOneAndUpdate(
    { _id: req.params.id, role: "employee", isActive: true },
    { $set: { isActive: false } },
    { new: true }
  );
  if (!employee) return res.status(404).json({ message: "Employee not found." });
  res.json({ message: "Employee deactivated. Their leave history has been retained." });
}));

app.patch("/api/employees/:id/balances", authRequired, adminRequired, asyncRoute(async (req, res) => {
  if (!LocalModel.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid employee." });
  const employee = await User.findOne({ _id: req.params.id, role: "employee", isActive: true });
  if (!employee) return res.status(404).json({ message: "Employee not found." });
  for (const key of Object.keys(balanceDefaults)) {
    if (req.body[key] !== undefined) {
      const value = Number(req.body[key]);
      if (!Number.isFinite(value) || value < 0 || value > 365) {
        return res.status(400).json({ message: "Leave balances must be between 0 and 365 days." });
      }
      employee.set(`balances.${key}`, value);
    }
  }
  await employee.save();
  res.json({ employee: safeUser(employee) });
}));

app.get("/api/departments", authRequired, asyncRoute(async (_req, res) => {
  const departments = await Department.find().sort({ name: 1 }).lean();
  res.json({ departments });
}));

app.post("/api/departments", authRequired, adminRequired, asyncRoute(async (req, res) => {
  const name = normalizeText(req.body.name);
  if (name.length < 2 || name.length > 80) return res.status(400).json({ message: "Department name must be between 2 and 80 characters." });
  if (await Department.exists({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })) {
    return res.status(409).json({ message: "That department already exists." });
  }
  const department = await Department.create({ name });
  res.status(201).json({ department });
}));

app.patch("/api/departments/:id", authRequired, adminRequired, asyncRoute(async (req, res) => {
  if (!LocalModel.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid department." });
  const name = normalizeText(req.body.name);
  if (name.length < 2 || name.length > 80) return res.status(400).json({ message: "Department name must be between 2 and 80 characters." });
  const department = await Department.findById(req.params.id);
  if (!department) return res.status(404).json({ message: "Department not found." });
  const duplicate = await Department.findOne({ _id: { $ne: department._id }, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  if (duplicate) return res.status(409).json({ message: "That department already exists." });
  const oldName = department.name;
  department.name = name;
  await department.save();
  await User.updateMany({ department: oldName }, { $set: { department: name } });
  await Leave.updateMany({ department: oldName }, { $set: { department: name } });
  res.json({ department });
}));

app.delete("/api/departments/:id", authRequired, adminRequired, asyncRoute(async (req, res) => {
  if (!LocalModel.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid department." });
  const department = await Department.findById(req.params.id);
  if (!department) return res.status(404).json({ message: "Department not found." });
  if (await User.exists({ department: department.name, isActive: true })) {
    return res.status(409).json({ message: "Move active employees to another department before removing this one." });
  }
  await department.deleteOne();
  res.json({ message: "Department removed." });
}));

app.get("/api/attachments/:filename", asyncRoute(async (req, res) => {
  const filename = path.basename(req.params.filename);
  const leave = await Leave.findOne({ documentFilename: filename });
  if (!leave || (req.user.role !== "admin" && String(leave.user) !== String(req.user._id))) {
    return res.status(404).json({ message: "Attachment not found." });
  }
  const filePath = path.join(uploadDirectory, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Attachment file is no longer available." });
  res.download(filePath, leave.documentOriginalName || filename);
}));

app.use("/vendor/fontawesome", express.static(path.join(__dirname, "node_modules", "@fortawesome", "fontawesome-free")));
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE" ? "File must be 5 MB or smaller." : "The attachment could not be uploaded.";
    return res.status(400).json({ message });
  }
  if (error.message?.startsWith("Only PDF")) return res.status(400).json({ message: error.message });
  if (error.code === 11000) return res.status(409).json({ message: "That email or department is already in use." });
  if (error.name === "ValidationError") return res.status(400).json({ message: "Some information is missing or invalid." });
  console.error(error);
  res.status(500).json({ message: "Something went wrong. Please try again." });
});

async function start() {
  await initializeStore();
  await fs.promises.mkdir(dataDirectory, { recursive: true });
  if (JWT_SECRET && JWT_SECRET.length < 24) {
    throw new Error("JWT_SECRET must be at least 24 characters.");
  }
  if (!JWT_SECRET) {
    const secretPath = path.join(dataDirectory, ".jwt-secret");
    try {
      JWT_SECRET = await fs.promises.readFile(secretPath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      JWT_SECRET = crypto.randomBytes(48).toString("base64url");
      try {
        await fs.promises.writeFile(secretPath, JWT_SECRET, { encoding: "utf8", flag: "wx" });
      } catch (writeError) {
        if (writeError.code !== "EEXIST") throw writeError;
        JWT_SECRET = await fs.promises.readFile(secretPath, "utf8");
      }
    }
  }
  await Department.bulkWrite(
    ["Engineering", "People & Culture", "Design", "Marketing", "Finance", "Operations"].map((name) => ({
      updateOne: { filter: { name }, update: { $setOnInsert: { name } }, upsert: true },
    }))
  );
  const email = (process.env.ADMIN_EMAIL || "admin@leavewise.local").trim().toLowerCase();
  let temporaryPassword = process.env.ADMIN_PASSWORD;
  if (temporaryPassword && temporaryPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
  }
  if (!temporaryPassword && !(await User.exists({ email }))) {
    temporaryPassword = crypto.randomBytes(18).toString("base64url");
  }
  const adminExists = await User.exists({ email });
  if (!adminExists) {
    const department = await Department.findOne({ name: "People & Culture" });
    await User.create({
      name: "HR Administrator",
      email,
      password: await bcrypt.hash(temporaryPassword, 12),
      employeeId: "HR-001",
      department: department.name,
      role: "admin",
    });
    console.log(`Provisioned HR administrator: ${email}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log(`Temporary HR password (save this now): ${temporaryPassword}`);
    }
  }
  console.log("Leavewise local data is saved in data/leavewise.json.");
  app.listen(PORT, () => console.log(`Leavewise is running at http://localhost:${PORT}`));
}

start().catch((error) => {
  console.error("Could not start Leavewise:", error);
  process.exitCode = 1;
});
