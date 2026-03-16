const prisma = require("../utills/db"); // ✅ Use shared connection with SSL
const { asyncHandler, handleServerError, AppError } = require("../utills/errorHandler");
const { validateProductData, productValidation } = require('../utills/validation');

const PAGE_SIZE = 12

// Security: Define whitelists for allowed filter types and operators
const ALLOWED_FILTER_TYPES = ['price', 'rating', 'category', 'inStock', 'outOfStock'];
const ALLOWED_OPERATORS = ['gte', 'lte', 'gt', 'lt', 'equals', 'contains'];
const ALLOWED_SORT_VALUES = ['defaultSort', 'titleAsc', 'titleDesc', 'lowPrice', 'highPrice'];

// Security: Input validation functions
function validateFilterType(filterType) {
  return ALLOWED_FILTER_TYPES.includes(filterType);
}

function validateOperator(operator) {
  return ALLOWED_OPERATORS.includes(operator);
}

function validateSortValue(sortValue) {
  return ALLOWED_SORT_VALUES.includes(sortValue);
}

function validateAndSanitizeFilterValue(filterType, filterValue) {
  switch (filterType) {
    case 'price':
    case 'rating':
    case 'inStock':
    case 'outOfStock':
      const numValue = parseInt(filterValue);
      return isNaN(numValue) ? null : numValue;
    case 'category':
      return typeof filterValue === 'string' && filterValue.trim().length > 0 
        ? filterValue.trim() 
        : null;
    default:
      return null;
  }
}

// Security: Safe filter object builder
function buildSafeFilterObject(filterArray) {
  const filterObj = {};
  
  for (const item of filterArray) {
    // Validate filter type
    if (!validateFilterType(item.filterType)) {
      console.warn(`Invalid filter type: ${item.filterType}`);
      continue;
    }
    
    // Validate operator
    if (!validateOperator(item.filterOperator)) {
      console.warn(`Invalid operator: ${item.filterOperator}`);
      continue;
    }
    
    // Validate and sanitize filter value
    const sanitizedValue = validateAndSanitizeFilterValue(item.filterType, item.filterValue);
    if (sanitizedValue === null) {
      console.warn(`Invalid filter value for ${item.filterType}: ${item.filterValue}`);
      continue;
    }
    
    // Build safe filter object
    filterObj[item.filterType] = {
      [item.filterOperator]: sanitizedValue,
    };
  }
  
  return filterObj;
}

const getAllProducts = asyncHandler(async (request, response) => {
  const mode = request.query.mode || "";
  
  // checking if we are on the admin products page because we don't want to have filtering, sorting and pagination there
  if(mode === "admin"){
    const adminProducts = await prisma.product.findMany({});
    return response.json(adminProducts);
  } else {
    const dividerLocation = request.url.indexOf("?");
    let filterObj = {};
    let sortObj = {};
    let sortByValue = "defaultSort";

    // getting current page with validation
    const page = Number(request.query.page);
    const validatedPage = (page && page > 0) ? page : 1;

    if (dividerLocation !== -1) {
      const queryArray = request.url
        .substring(dividerLocation + 1, request.url.length)
        .split("&");

      let filterType;
      let filterArray = [];

      for (let i = 0; i < queryArray.length; i++) {
        // Security: Use more robust parsing with validation
        const queryParam = queryArray[i];
        
        // Extract filter type safely
        if (queryParam.includes("filters")) {
          if (queryParam.includes("price")) {
            filterType = "price";
          } else if (queryParam.includes("rating")) {
            filterType = "rating";
          } else if (queryParam.includes("category")) {
            filterType = "category";
          } else if (queryParam.includes("inStock")) {
            filterType = "inStock";
          } else if (queryParam.includes("outOfStock")) {
            filterType = "outOfStock";
          } else {
            // Skip unknown filter types
            continue;
          }
        }

        if (queryParam.includes("sort")) {
          // Security: Validate sort value
          const extractedSortValue = queryParam.substring(queryParam.indexOf("=") + 1);
          if (validateSortValue(extractedSortValue)) {
            sortByValue = extractedSortValue;
          }
        }

        // Security: Extract filter parameters safely
        if (queryParam.includes("filters") && filterType) {
          let filterValue;
          
          // Extract filter value based on type
          if (filterType === "category") {
            filterValue = queryParam.substring(queryParam.indexOf("=") + 1);
          } else {
            const numValue = parseInt(queryParam.substring(queryParam.indexOf("=") + 1));
            filterValue = isNaN(numValue) ? null : numValue;
          }

          // Extract operator safely
          const operatorStart = queryParam.indexOf("$") + 1;
          const operatorEnd = queryParam.indexOf("=") - 1;
          
          if (operatorStart > 0 && operatorEnd > operatorStart) {
            const filterOperator = queryParam.substring(operatorStart, operatorEnd);
            
            // Only add to filter array if all values are valid
            if (filterValue !== null && filterOperator) {
              filterArray.push({ 
                filterType, 
                filterOperator, 
                filterValue 
              });
            }
          }
        }
      }
      
      // Security: Build filter object using safe function
      filterObj = buildSafeFilterObject(filterArray);
    }

    let whereClause = { ...filterObj };

    // Security: Handle category filter separately with validation
    if (filterObj.category && filterObj.category.equals) {
      delete whereClause.category;
    }

    // Security: Build sort object safely
    switch (sortByValue) {
      case "defaultSort":
        sortObj = {};
        break;
      case "titleAsc":
        sortObj = { title: "asc" };
        break;
      case "titleDesc":
        sortObj = { title: "desc" };
        break;
      case "lowPrice":
        sortObj = { price: "asc" };
        break;
      case "highPrice":
        sortObj = { price: "desc" };
        break;
      default:
        sortObj = {};
    }

    let products;

    if (Object.keys(filterObj).length === 0) {
      products = await prisma.product.findMany({
        skip: (validatedPage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          category: {
            select: {
              name: true,
            },
          },
        },
        orderBy: sortObj,
      });
    } else {
      // Security: Handle category filter with proper validation
      if (filterObj.category && filterObj.category.equals) {
        products = await prisma.product.findMany({
          skip: (validatedPage - 1) * 10,
          take: 12,
          include: {
            category: {
              select: {
                name: true,
              },
            },
          },
          where: {
            ...whereClause,
            category: {
              name: {
                equals: filterObj.category.equals,
              },
            },
          },
          orderBy: sortObj,
        });
      } else {
        products = await prisma.product.findMany({
          skip: (validatedPage - 1) * 10,
          take: 12,
          include: {
            category: {
              select: {
                name: true,
              },
            },
          },
          where: whereClause,
          orderBy: sortObj,
        });
      }
    }

    return response.json(products);
  }
});

const createProduct = asyncHandler(async (request, response) => {
  
  if (!request.body || typeof request.body !== 'object') {
      throw new AppError("Request body must be a valid JSON object or Invalid request body", 400);
  }
/*   if (!title) {
    throw new AppError("Missing required field: title", 400);
  }
  if (!slug) {
    throw new AppError("Missing required field: slug", 400);
  }
  if (!price) {
    throw new AppError("Price must be a positive number", 400);
  }
  if (!categoryId) {
    throw new AppError("Missing required field: categoryId", 400);
  }
  if (!mainImage) {
    throw new AppError("Missing required field: mainImage", 400);
  }
  if (!description) {
    throw new AppError("Missing required field: description", 400);
  }
  if (!manufacturer) {
    throw new AppError("Missing required field: manufacturer", 400);
  } */
  
  const validation = validateProductData(request.body);
    
  if (!validation.isValid) {
    console.error("❌ Validation failed:", validation.errors);
    return response.status(400).json({
      error: "Validation failed",
      details: validation.errors
    });
  }
  const validatedData = validation.validatedData;

  const existing = await prisma.product.findUnique({
    where: { slug: validatedData.slug }
  });
  if (existing) {
    throw new AppError("A product with this slug already exists", 409);
  }

  const product = await prisma.product.create({
    data: {
      merchantId: process.env.STORE_MERCHANT_ID,
      slug:validatedData.slug,
      title:validatedData.title,
      mainImage:validatedData.mainImage,
      price:validatedData.price,
      rating: 5,
      description:validatedData.description,
      manufacturer:validatedData.manufacturer,
      categoryId:validatedData.categoryId,
      inStock:validatedData.inStock??1,
    },
  });
  return response.status(201).json(product);
});

// Method for updating existing product
const updateProduct = asyncHandler(async (request, response) => {
  const { id } = request.params;
;
  // Basic validation
  if (!id|| typeof id !== 'string') {
    throw new AppError("Product ID is required or id must be a number", 400);
  }
  if (!request.body || typeof request.body !== 'object') {
      console.error("❌ Invalid request body");
      throw new AppError("Request body must be a valid JSON object or Invalid request body", 400);
  }
  const existingProduct = await prisma.product.findUnique({ where: { id } });
  if (!existingProduct) {
    throw new AppError("Product not found", 404);
  }

  // Only validate and update fields that were actually sent
  const updateData = {};
  const body = request.body;

  if (body.title !== undefined) {
    const r = productValidation.validateTitle(body.title);
    updateData.title = r;
  }
  if (body.slug !== undefined) {
    const r = productValidation.validateSlug(body.slug);
    updateData.slug = r;
  }
  if (body.mainImage !== undefined) {
    const r = productValidation.validateMainImage(body.mainImage);
    updateData.mainImage = r;
  }
  if (body.price !== undefined) {
    const r = productValidation.validatePrice(body.price);
    updateData.price = r;
  }
  if (body.description !== undefined) {
    const r = productValidation.validateDescription(body.description);
    updateData.description = r;
  }
  if (body.manufacturer !== undefined) {
    const r = productValidation.validateManufacturer(body.manufacturer);
    updateData.manufacturer = r;
  }
  if (body.categoryId !== undefined) {
    const r = productValidation.validateCategoryId(body.categoryId);
    updateData.categoryId = r;
  }
  if (body.inStock !== undefined) {
    const r = productValidation.validateInStock(body.inStock);
    updateData.inStock = r;
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError("No valid fields provided for update", 400);
  }

  const updatedProduct = await prisma.product.update({
    where: { id },
    data: updateData,
  });

  return response.status(200).json(updatedProduct);
});

// Method for deleting a product
const deleteProduct = asyncHandler(async (request, response) => {
  const { id } = request.params;

  if (!id) {
    throw new AppError("Product ID is required", 400);
  }

  // Check for related records in order_product table
  const relatedOrderProductItems = await prisma.customer_order_product.findMany({
    where: {
      productId: id,
    },
  });
  
  if(relatedOrderProductItems.length > 0){
    throw new AppError("Cannot delete product because of foreign key constraint", 400);
  }

  await prisma.product.delete({
    where: {
      id,
    },
  });
  return response.status(204).send();
});


const getProductById = asyncHandler(async (request, response) => {
  const { id } = request.params;
  
  if (!id) {
    throw new AppError("Product ID is required", 400);
  }

  const product = await prisma.product.findUnique({
    where: {
      id: id,
    },
    include: {
      category: true,
    },
  });
  
  if (!product) {
    throw new AppError("Product not found", 404);
  }
  
  return response.status(200).json(product);
});

module.exports = {
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductById,
};
