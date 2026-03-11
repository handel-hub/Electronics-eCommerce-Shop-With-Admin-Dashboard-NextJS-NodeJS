const { asyncHandler, AppError } = require("../utills/errorHandler")
const prisma = require("../utills/db");

const searchProducts = asyncHandler(async (request, response) => {
    const { query } = request.query;
    
    if (!query) {
        throw new AppError("Query parameter is required", 400);
    }

    const products = await prisma.product.findMany({
        where: {
        OR: [
            {
            title: {
                contains: query,
                mode: 'insensitive',
            },
            },
            {
            description: {
                contains: query,
                mode: 'insensitive',
            },
            },
        ],
        },
    });

    return response.json(products);
});


module.exports = { searchProducts };