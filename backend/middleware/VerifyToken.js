import jwt from 'jsonwebtoken';

export const verifyToken = (req, res, next) => {
    const token = req.header('x-auth-token');

    if (!token) {
        console.warn(`[AUTH] No token on ${req.method} ${req.originalUrl}`);
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.warn(`[AUTH] Token rejected on ${req.originalUrl}: ${err.name} - ${err.message}`);
        res.status(401).json({ msg: 'Token is not valid', reason: err.name });
    }
};