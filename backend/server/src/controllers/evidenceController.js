const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');

const ROOT = '/app/storage/evidence';

exports.getImage = async (req, res) => {
    const id = Number(req.params.id);
    const type = req.params.type;

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: 'ID su kien khong hop le'
        });
    }

    if (!['snapshot', 'plate'].includes(type)) {
        return res.status(400).json({
            message: 'Loai anh khong hop le'
        });
    }

    const [[row]] = await db.query(`
        SELECT
            event_id,
            image_path,
            plate_image_path
        FROM access_logs
        WHERE id = ?
    `, [id]);

    if (!row || !row.event_id) {
        return res.status(404).json({
            message: 'Khong tim thay anh'
        });
    }

    const relativePath = type === 'snapshot'
        ? row.image_path
        : row.plate_image_path;

    const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(row.event_id)) {
        return res.sendStatus(404);
    }

    const pattern =
        /^(\d{4})\/(\d{2})\/(\d{2})\/([0-9a-f-]{36})\/(snapshot|plate)\.jpg$/;

    const match = String(relativePath || '').match(pattern);

    if (
        !match ||
        match[4] !== row.event_id.toLowerCase() ||
        match[5] !== type
    ) {
        return res.sendStatus(404);
    }

    let buffer;

    try {
        const realRoot = await fs.realpath(ROOT);

        const realFile = await fs.realpath(
            path.join(ROOT, relativePath)
        );

        if (!realFile.startsWith(realRoot + path.sep)) {
            return res.sendStatus(403);
        }

        const stat = await fs.stat(realFile);

        if (
            !stat.isFile() ||
            stat.size < 4 ||
            stat.size > 2 * 1024 * 1024
        ) {
            return res.sendStatus(404);
        }

        buffer = await fs.readFile(realFile);

    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.sendStatus(404);
        }

        throw error;
    }

    res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename="${type}.jpg"`
    });

    return res.send(buffer);
};
