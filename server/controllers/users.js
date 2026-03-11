const { asyncHandler, AppError } = require("../utills/errorHandler");
const { SUSPICIOUS_PATTERNS } = require("../utills/validation"); // reuse existing
const prisma = require("../utills/db");
const bcrypt = require("bcryptjs");

const ALLOWED_ROLES  = ['user', 'admin'];
const BCRYPT_ROUNDS  = 12;
const EMAIL_REGEX    = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,72}$/;
// Max 72 chars — bcrypt silently truncates beyond 72 anyway

function excludePassword(user) {
  if (!user) return user;
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new AppError("Email is required", 400);
  }

  const trimmed = email.trim().toLowerCase();

  if (SUSPICIOUS_PATTERNS.some(p => p.test(trimmed))) {
    throw new AppError("Email contains invalid characters", 400);
  }

  if (trimmed.length > 254) {
    throw new AppError("Email must be less than 254 characters", 400);
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    throw new AppError("Invalid email format", 400);
  }

  return trimmed;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    throw new AppError("Password is required", 400);
  }

  if (password.length > 72) {
    throw new AppError("Password must be less than 72 characters", 400);
  }

  if (!PASSWORD_REGEX.test(password)) {
    throw new AppError(
      "Password must be at least 8 characters and include uppercase, lowercase, number and special character (@$!%*?&)",
      400
    );
  }
}

function validateRole(role) {
  if (!ALLOWED_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}`, 400);
  }
  return role;
}

const getAllUsers = asyncHandler(async (request, response) => {
  const users = await prisma.user.findMany({});
  return response.json(users.map(excludePassword));
});

const createUser = asyncHandler(async (request, response) => {
  const { email, password, role } = request.body;

  const validatedEmail = validateEmail(email);
  validatePassword(password);

  const existingUser = await prisma.user.findUnique({
    where: { email: validatedEmail }
  });

  if (existingUser) {
    throw new AppError("Email already in use", 409);
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: validatedEmail,
      password: hashedPassword,
      role: role ? validateRole(role) : 'user',
    },
  });

  return response.status(201).json(excludePassword(user));
});

const updateUser = asyncHandler(async (request, response) => {
  const { id } = request.params;
  const { email, password, role } = request.body;

  if (!id) throw new AppError("User ID is required", 400);

  const existingUser = await prisma.user.findUnique({ where: { id } });
  if (!existingUser) throw new AppError("User not found", 404);

  const updateData = {};

  if (email) {
    updateData.email = validateEmail(email);
  }
  if (password) {
    validatePassword(password);
    updateData.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }
  if (role) {
    updateData.role = validateRole(role);
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData,
  });

  return response.status(200).json(excludePassword(updatedUser));
});

const deleteUser = asyncHandler(async (request, response) => {
  const { id } = request.params;

  if (!id) throw new AppError("User ID is required", 400);

  const existingUser = await prisma.user.findUnique({ where: { id } });
  if (!existingUser) throw new AppError("User not found", 404);

  await prisma.user.delete({ where: { id } });
  return response.status(204).send();
});

const getUser = asyncHandler(async (request, response) => {
  const { id } = request.params;

  if (!id) throw new AppError("User ID is required", 400);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError("User not found", 404);

  return response.status(200).json(excludePassword(user));
});

const getUserByEmail = asyncHandler(async (request, response) => {
  const { email } = request.params;

  const validatedEmail = validateEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: validatedEmail }
  });

  if (!user) throw new AppError("User not found", 404);

  return response.status(200).json(excludePassword(user));
});

module.exports = {
  createUser,
  updateUser,
  deleteUser,
  getUser,
  getAllUsers,
  getUserByEmail,
};
