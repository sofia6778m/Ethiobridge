const News = require('../models/News');

const createNews = async (req, res) => {
  try {
    const { title, content, summary, category, region, tags } = req.body;
    const featuredImage = req.file ? req.file.path : '';

    const news = await News.create({
      title, content, summary, category, region,
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      featuredImage,
      author: req.user._id,
      organizationName: req.user.organizationName || req.user.fullName,
    });

    res.status(201).json({ success: true, news });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllNews = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 9 } = req.query;
    const query = { isPublished: true };

    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { summary: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await News.countDocuments(query);
    const news = await News.find(query)
      .populate('author', 'fullName organizationName role')
      .sort({ publishedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), news });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAdminAllNews = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 10 } = req.query;
    const query = {};
    if (category) query.category = category;
    if (search) query.$or = [{ title: { $regex: search, $options: 'i' } }];

    const total = await News.countDocuments(query);
    const news = await News.find(query)
      .populate('author', 'fullName organizationName role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), news });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSingleNews = async (req, res) => {
  try {
    const news = await News.findById(req.params.id).populate('author', 'fullName organizationName role');
    if (!news) return res.status(404).json({ success: false, message: 'News not found' });

    news.views += 1;
    await news.save();

    res.json({ success: true, news });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const publishNews = async (req, res) => {
  try {
    const news = await News.findByIdAndUpdate(
      req.params.id,
      { isPublished: true, publishedAt: new Date() },
      { new: true }
    );
    if (!news) return res.status(404).json({ success: false, message: 'News not found' });
    res.json({ success: true, news });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateNews = async (req, res) => {
  try {
    const { title, content, summary, category, region, tags } = req.body;
    const updateFields = { title, content, summary, category, region };
    if (tags) updateFields.tags = tags.split(',').map(t => t.trim());
    if (req.file) updateFields.featuredImage = req.file.path;

    Object.keys(updateFields).forEach(k => updateFields[k] === undefined && delete updateFields[k]);

    const news = await News.findByIdAndUpdate(req.params.id, updateFields, { new: true });
    if (!news) return res.status(404).json({ success: false, message: 'News not found' });
    res.json({ success: true, news });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteNews = async (req, res) => {
  try {
    const news = await News.findByIdAndDelete(req.params.id);
    if (!news) return res.status(404).json({ success: false, message: 'News not found' });
    res.json({ success: true, message: 'News deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createNews, getAllNews, getAdminAllNews, getSingleNews, publishNews, updateNews, deleteNews };
