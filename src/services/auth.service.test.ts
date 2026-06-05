import { describe, it, expect, beforeEach } from 'vitest';
import { makeAuthService, toActor } from './auth.service';
import { InMemoryUserRepository } from '../repositories/in-memory';
import { hashPassword } from '../utils/crypto';
import type { User } from '../core/entities/user';
import { UnauthorizedError } from '../core/errors/app-error';

async function seedUser(repo: InMemoryUserRepository, over: Partial<User> = {}): Promise<User> {
  const now = new Date().toISOString();
  const user: User = {
    id: 'u1',
    firstName: 'Ada',
    lastName: 'Admin',
    email: 'admin@campplatform.org',
    role: 'admin',
    churchId: null,
    churchName: null,
    zone: null,
    status: 'active',
    passwordHash: await hashPassword('demo1234'),
    createdAt: now,
    updatedAt: now,
    ...over,
  };
  await repo.save(user);
  return user;
}

describe('AuthService.login', () => {
  let repo: InMemoryUserRepository;
  beforeEach(async () => {
    repo = new InMemoryUserRepository();
    await repo.init();
  });

  it('issues a token for valid credentials and never returns the password hash', async () => {
    await seedUser(repo);
    const svc = makeAuthService(repo);
    const res = await svc.login({ email: 'admin@campplatform.org', password: 'demo1234' });
    expect(res.token).toMatch(/^[a-f0-9]{64}$/);
    expect(res.user.email).toBe('admin@campplatform.org');
    expect((res.user as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('is case-insensitive on email', async () => {
    await seedUser(repo);
    const svc = makeAuthService(repo);
    const res = await svc.login({ email: 'ADMIN@CampPlatform.org', password: 'demo1234' });
    expect(res.token).toBeTruthy();
  });

  it('rejects a wrong password', async () => {
    await seedUser(repo);
    const svc = makeAuthService(repo);
    await expect(svc.login({ email: 'admin@campplatform.org', password: 'nope' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('rejects inactive accounts', async () => {
    await seedUser(repo, { status: 'inactive' });
    const svc = makeAuthService(repo);
    await expect(
      svc.login({ email: 'admin@campplatform.org', password: 'demo1234' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects malformed input without throwing a non-auth error', async () => {
    const svc = makeAuthService(repo);
    await expect(svc.login({ email: 'not-an-email' })).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('AuthService token lifecycle', () => {
  it('resolveToken round-trips to an Actor; logout invalidates it', async () => {
    const repo = new InMemoryUserRepository();
    await repo.init();
    await seedUser(repo);
    const svc = makeAuthService(repo);

    const { token } = await svc.login({ email: 'admin@campplatform.org', password: 'demo1234' });
    const actor = await svc.resolveToken(token);
    expect(actor?.role).toBe('admin');
    expect(actor?.displayName).toBe('Ada Admin');

    await svc.logout(token);
    expect(await svc.resolveToken(token)).toBeNull();
  });

  it('resolveToken returns null for an unknown token', async () => {
    const repo = new InMemoryUserRepository();
    await repo.init();
    const svc = makeAuthService(repo);
    expect(await svc.resolveToken('deadbeef')).toBeNull();
  });
});

describe('toActor()', () => {
  it('derives displayName and normalises optional fields to null', () => {
    const now = new Date().toISOString();
    const actor = toActor({
      id: 'u2',
      firstName: 'Zoe',
      lastName: 'Zone',
      email: 'zoe@campplatform.org',
      role: 'zoneLeader',
      zone: 'Yellow',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    } as User);
    expect(actor.displayName).toBe('Zoe Zone');
    expect(actor.zone).toBe('Yellow');
    expect(actor.churchId).toBeNull();
  });
});
