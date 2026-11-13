exports.wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
exports.notFound = (req, res) => res.status(404).json({ message: 'Không tìm thấy API' });
exports.errorHandler = (err, req, res, next) => {
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Dữ liệu bị trùng (biển số / mã / tài khoản đã tồn tại)' });
  if (err.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ message: 'Không thể xóa: dữ liệu đang được sử dụng' });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Lỗi máy chủ' });
};
