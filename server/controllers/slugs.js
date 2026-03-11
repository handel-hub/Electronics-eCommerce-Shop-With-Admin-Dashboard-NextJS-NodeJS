const prisma = require("../utills/db");
const { asyncHandler, AppError } = require("../utills/errorHandler");

const getProductBySlug = asyncHandler(async (request, response) => {
  const { slug } = request.params;

  const product = await prisma.product.findUnique({
    where: { slug },
    include: { category: true }
  });

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  return response.status(200).json(product);
});

module.exports = { getProductBySlug };
