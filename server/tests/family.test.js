import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { setupTestDB, clearTestDB, teardownTestDB } from './setup.js';

describe('Family & Child Account Management (Phase 2)', () => {
  let parentToken;
  let childToken;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();

    // Register a parent
    const parentRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Bruce Wayne',
      email: 'bruce@wayne.com',
      password: 'DarkKnight2026!',
    });
    parentToken = parentRes.body.data.accessToken;
  });

  describe('POST /api/v1/family/children', () => {
    it('should allow a parent to create a child account with parental consent', async () => {
      const childPayload = {
        name: 'Damian Wayne',
        email: 'damian@wayne.com',
        password: 'RobinPassword2026!',
        dateOfBirth: '2014-05-10', // 12 years old
      };

      const res = await request(app)
        .post('/api/v1/family/children')
        .set('Authorization', `Bearer ${parentToken}`)
        .send(childPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.child).toBeDefined();
      expect(res.body.data.child.role).toBe('child');
      expect(res.body.data.familyLink).toBeDefined();
      expect(res.body.data.familyLink.status).toBe('active');
      expect(res.body.data.familyLink.consentGivenAt).toBeDefined();
    });

    it('should allow linking any dependent account regardless of age (including over 18)', async () => {
      const adultPayload = {
        name: 'Dick Grayson',
        email: 'dick@wayne.com',
        password: 'NightwingPass123!',
        dateOfBirth: '2000-01-01', // > 18 years old
      };

      const res = await request(app)
        .post('/api/v1/family/children')
        .set('Authorization', `Bearer ${parentToken}`)
        .send(adultPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.child).toBeDefined();
      expect(res.body.data.child.role).toBe('child');
    });

    it('should forbid a child account from creating another child account', async () => {
      // 1. Parent creates child
      await request(app)
        .post('/api/v1/family/children')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          name: 'Damian Wayne',
          email: 'damian@wayne.com',
          password: 'RobinPassword2026!',
          dateOfBirth: '2014-05-10',
        });

      // 2. Child logs in
      const childLoginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'damian@wayne.com',
        password: 'RobinPassword2026!',
      });
      childToken = childLoginRes.body.data.accessToken;

      // 3. Child tries to create another child -> should be 403 Forbidden
      const res = await request(app)
        .post('/api/v1/family/children')
        .set('Authorization', `Bearer ${childToken}`)
        .send({
          name: 'Tim Drake',
          email: 'tim@wayne.com',
          password: 'RobinPassword2026!',
          dateOfBirth: '2015-01-01',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/v1/family/children', () => {
    it('should list all children linked to the authenticated parent', async () => {
      // Create two children
      await request(app)
        .post('/api/v1/family/children')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          name: 'Child One',
          email: 'child1@example.com',
          password: 'ChildPass123!',
          dateOfBirth: '2015-01-01',
        });

      await request(app)
        .post('/api/v1/family/children')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          name: 'Child Two',
          email: 'child2@example.com',
          password: 'ChildPass123!',
          dateOfBirth: '2017-06-01',
        });

      const res = await request(app)
        .get('/api/v1/family/children')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.children).toHaveLength(2);
      expect(res.body.data.children[0].name).toBe('Child One');
      expect(res.body.data.children[1].name).toBe('Child Two');
    });
  });
});
