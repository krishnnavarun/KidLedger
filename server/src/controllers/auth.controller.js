import { AuthService } from '../services/auth.service.js';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTIONS,
} from '../utils/tokens.js';

export class AuthController {
  static async register(req, res, next) {
    try {
      const { name, email, password } = req.body;
      const { user, accessToken, refreshToken } = await AuthService.registerParent({
        name,
        email,
        password,
      });

      res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

      res.status(201).json({
        success: true,
        data: {
          user,
          accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const { user, accessToken, refreshToken } = await AuthService.login({
        email,
        password,
      });

      res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

      res.status(200).json({
        success: true,
        data: {
          user,
          accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req, res, next) {
    try {
      const token = req.cookies[REFRESH_COOKIE_NAME];
      const { user, accessToken, refreshToken } = await AuthService.refreshSession(token);

      res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);

      res.status(200).json({
        success: true,
        data: {
          user,
          accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req, res) {
    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
    res.status(200).json({
      success: true,
      data: {
        message: 'Logged out successfully',
      },
    });
  }

  static async getMe(req, res) {
    res.status(200).json({
      success: true,
      data: {
        user: req.user,
      },
    });
  }
}
