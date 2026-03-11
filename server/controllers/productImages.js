const cloudinary = require("cloudinary").v2;
const prisma = require("../utills/db");
const { asyncHandler, AppError } = require("../utills/errorHandler");

const ALLOWED_TYPES  = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE       = 5 * 1024 * 1024; // 5MB

// Helper — upload buffer to Cloudinary
function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: "products", resource_type: "image" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(buffer);
  });
}

// Helper — delete from Cloudinary by public_id
async function deleteFromCloudinary(imageUrl) {
  // Extract public_id from URL
  // URL format: https://res.cloudinary.com/cloud/image/upload/v123/products/filename.jpg
  // public_id  = products/filename  (no extension)
  const parts   = imageUrl.split("/");
  const file    = parts[parts.length - 1].split(".")[0];
  const folder  = parts[parts.length - 2];
  const publicId = `${folder}/${file}`;

  await cloudinary.uploader.destroy(publicId);
}

// GET /api/product-images/:id
const getSingleProductImages = asyncHandler(async (request, response) => {
  const { id } = request.params;

  const images = await prisma.image.findMany({
    where: { productID: id },
  });

  if (!images || images.length === 0) {
    throw new AppError("Images not found", 404);
  }

  return response.json(images);
});

// POST /api/product-images
const createImage = asyncHandler(async (request, response) => {
  const { productID } = request.body;

  if (!productID) {
    throw new AppError("productID is required", 400);
  }

  // Verify product exists
  const product = await prisma.product.findUnique({
    where: { id: productID }
  });
  if (!product) {
    throw new AppError("Product not found", 404);
  }

  // Check file was uploaded
  if (!request.files || !request.files.image) {
    throw new AppError("No image file uploaded", 400);
  }

  const uploadedFile = request.files.image;

  // Validate type
  if (!ALLOWED_TYPES.includes(uploadedFile.mimetype)) {
    throw new AppError("Only JPG, PNG and WebP images allowed", 400);
  }

  // Validate size
  if (uploadedFile.size > MAX_SIZE) {
    throw new AppError("File size must be under 5MB", 400);
  }

  // Upload to Cloudinary
  const result = await uploadToCloudinary(uploadedFile.data);

  // Save URL to database
  const image = await prisma.image.create({
    data: {
      productID,
      image: result.secure_url,
    },
  });

  return response.status(201).json(image);
});

// PUT /api/product-images/:id
const updateImage = asyncHandler(async (request, response) => {
  const { id } = request.params;

  // Find existing image by productID
  const existingImage = await prisma.image.findFirst({
    where: { productID: id },
  });

  if (!existingImage) {
    throw new AppError("Image not found for the provided productID", 404);
  }

  // Check new file was uploaded
  if (!request.files || !request.files.image) {
    throw new AppError("No image file uploaded", 400);
  }

  const uploadedFile = request.files.image;

  // Validate type
  if (!ALLOWED_TYPES.includes(uploadedFile.mimetype)) {
    throw new AppError("Only JPG, PNG and WebP images allowed", 400);
  }

  // Validate size
  if (uploadedFile.size > MAX_SIZE) {
    throw new AppError("File size must be under 5MB", 400);
  }

  // Delete old image from Cloudinary
  await deleteFromCloudinary(existingImage.image);

  // Upload new image to Cloudinary
  const result = await uploadToCloudinary(uploadedFile.data);

  // Update URL in database
  const updatedImage = await prisma.image.update({
    where: { imageID: existingImage.imageID },
    data:  { image: result.secure_url },
  });

  return response.json(updatedImage);
});

// DELETE /api/product-images/:id
const deleteImage = asyncHandler(async (request, response) => {
  const { id } = request.params;

  // Get all images for this product before deleting
  const images = await prisma.image.findMany({
    where: { productID: String(id) },
  });

  if (!images || images.length === 0) {
    throw new AppError("No images found for this product", 404);
  }

  // Delete each image from Cloudinary
  await Promise.all(
    images.map(img => deleteFromCloudinary(img.image))
  );

  // Delete all from database
  await prisma.image.deleteMany({
    where: { productID: String(id) },
  });

  return response.status(204).send();
});

module.exports = {
  getSingleProductImages,
  createImage,
  updateImage,
  deleteImage,
};
