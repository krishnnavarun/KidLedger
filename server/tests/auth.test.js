import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { setupTestDB, clearTestDB, teardownTestDB } from './setup.js';

describe('Authentication Flow (Phase 2)', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new parent successfully and return tokens', async () => {
      const payload = {
        name: 'Sarah Connor',
        email: 'sarah@example.com',
        password: 'Password123!',
      };

      const res = await request(app).post('/api/v1/auth/register').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('sarah@example.com');
      expect(res.body.data.user.role).toBe('parent');
      expect(res.body.data.user.passwordHash).toBeUndefined(); // Ensure hash is never exposed
      expect(res.body.data.accessToken).toBeDefined();

      // Check refresh token cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c) => c.includes('kidledger_refresh'))).toBe(true);
    });

    it('should reject registration if email is already registered', async () => {
      const payload = {
        name: 'Sarah Connor',
        email: 'sarah@example.com',
        password: 'Password123!',
      };

      await request(app).post('/api/v1/auth/register').send(payload);
      const res = await request(app).post('/api/v1/auth/register').send(payload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_EXISTS');
    });

    it('should fail validation when password is too short', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'Short Pass',
        email: 'short@example.com',
        password: '123',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login & /refresh', () => {
    it('should login parent and issue tokens', async () => {
      await request(app).post('/api/v1/auth/register').send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'SecretPassword123',
      });

      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'john@example.com',
        password: 'SecretPassword123',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should reject login with incorrect password', async () => {
      await request(app).post('/api/v1/auth/register').send({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'SecretPassword123',
      });

      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'john@example.com',
        password: 'WrongPassword',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should allow token refresh using cookie', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'SecretPassword123',
      });

      const cookie = regRes.headers['set-cookie'];

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.accessToken).toBeDefined();
    });
  });

  describe('Protected Routes & GET /api/v1/auth/me', () => {
    it('should return 401 when accessing protected route without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return user info when valid token is provided', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send({
        name: 'Authorized User',
        email: 'auth@example.com',
        password: 'SecretPassword123',
      });

      const token = regRes.body.data.accessToken;

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('auth@example.com');
    });
  });
});
