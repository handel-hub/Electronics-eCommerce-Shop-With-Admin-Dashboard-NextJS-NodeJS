const cloudinary = require("cloudinary").v2;
const { asyncHandler, AppError } = require("../utills/errorHandler");

// Configure cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const MAX_SIZE      = 5 * 1024 * 1024; // 5MB

const uploadMainImage = asyncHandler(async (req, res) => {
  // Check file exists
  if (!req.files || !req.files.uploadedFile) {
    throw new AppError("No file uploaded", 400);
  }

  const uploadedFile = req.files.uploadedFile;

  // Validate file type
  if (!ALLOWED_TYPES.includes(uploadedFile.mimetype)) {
    throw new AppError("Only JPG, PNG and WebP images allowed", 400);
  }

  // Validate file size
  if (uploadedFile.size > MAX_SIZE) {
    throw new AppError("File size must be under 5MB", 400);
  }

  // Upload to Cloudinary using buffer data
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder:         "products",
        resource_type:  "image",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(uploadedFile.data);  // express-fileupload stores file in .data buffer
  });

  return res.status(200).json({
    message: "Image uploaded successfully",
    url:     result.secure_url,   // store this in product.mainImage
    publicId: result.public_id,   // store this if you want to delete later
  });
});
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
module.exports = { uploadMainImage,deleteFromCloudinary };
