const express = require('express')
const router = express.Router()
const {
  getSingleProductImages,
  createImage,
  updateImage,
  deleteImage
} = require('../controllers/productImages')

router.route('/').post(createImage);
router.route('/:id')
  .get(getSingleProductImages)
  .put(updateImage)
  .delete(deleteImage);
module.exports = router
