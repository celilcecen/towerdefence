import { describe, expect, it } from "vitest";
import { applyDamage, applySlow, damageAfterArmor, tickSlow } from "../src/core/combat/damage";
import { enemiesInRange, TARGETING } from "../src/core/combat/targeting";
import { makeEnemy, makeTickContext, recordEvents, TEST_ENEMY } from "./support/fixtures";

describe("damageAfterArmor", () => {
  it("subtracts flat armor", () => {
    expect(damageAfterArmor(20, 5, 0.2)).toBe(15);
  });

  it("never drops below the minimum share of raw damage", () => {
    expect(damageAfterArmor(10, 50, 0.2)).toBe(2);
  });
});

describe("applyDamage", () => {
  it("reduces hp, reports the hit and kills at zero", () => {
    const ctx = makeTickContext();
    const hits = recordEvents(ctx.events, "enemyHit");
    const enemy = makeEnemy({ hp: 15 });

    applyDamage(ctx, enemy, 10);
    expect(enemy.hp).toBe(5);
    expect(enemy.status).toBe("alive");

    applyDamage(ctx, enemy, 10);
    expect(enemy.hp).toBe(0);
    expect(enemy.status).toBe("killed");
    expect(hits.map((h) => h.damage)).toEqual([10, 10]);
  });

  it("applies armor from the enemy definition", () => {
    const ctx = makeTickContext();
    const enemy = makeEnemy({ def: { ...TEST_ENEMY, armor: 4 }, hp: 100 });
    applyDamage(ctx, enemy, 10);
    expect(enemy.hp).toBe(94);
  });

  it("ignores enemies that are no longer alive", () => {
    const ctx = makeTickContext();
    const hits = recordEvents(ctx.events, "enemyHit");
    const enemy = makeEnemy({ status: "leaked", hp: 30 });
    applyDamage(ctx, enemy, 10);
    expect(enemy.hp).toBe(30);
    expect(hits).toHaveLength(0);
  });
});

describe("slow effects", () => {
  it("applies a slow and expires it", () => {
    const enemy = makeEnemy();
    applySlow(enemy, { factor: 0.5, duration: 1 });
    expect(enemy.slowFactor).toBe(0.5);
    tickSlow(enemy, 0.6);
    expect(enemy.slowFactor).toBe(0.5);
    tickSlow(enemy, 0.6);
    expect(enemy.slowFactor).toBe(1);
    expect(enemy.slowTimer).toBe(0);
  });

  it("lets a stronger slow replace a weaker one", () => {
    const enemy = makeEnemy();
    applySlow(enemy, { factor: 0.6, duration: 2 });
    applySlow(enemy, { factor: 0.3, duration: 0.5 });
    expect(enemy.slowFactor).toBe(0.3);
    expect(enemy.slowTimer).toBe(0.5);
  });

  it("refreshes an equal slow but ignores a weaker one while active", () => {
    const enemy = makeEnemy();
    applySlow(enemy, { factor: 0.5, duration: 0.5 });
    applySlow(enemy, { factor: 0.5, duration: 2 });
    expect(enemy.slowTimer).toBe(2);
    applySlow(enemy, { factor: 0.9, duration: 5 });
    expect(enemy.slowFactor).toBe(0.5);
    expect(enemy.slowTimer).toBe(2);
  });

  it("does not slow dead enemies, and ticking an unslowed enemy is a no-op", () => {
    const dead = makeEnemy({ status: "killed" });
    applySlow(dead, { factor: 0.1, duration: 1 });
    expect(dead.slowFactor).toBe(1);
    tickSlow(dead, 1);
    expect(dead.slowTimer).toBe(0);
  });
});

describe("targeting strategies", () => {
  const origin = { x: 0, y: 0 };
  const near = makeEnemy({ id: 1, x: 1, y: 0, remaining: 8, hp: 10 });
  const ahead = makeEnemy({ id: 2, x: 3, y: 0, remaining: 2, hp: 20 });
  const tough = makeEnemy({ id: 3, x: 2, y: 0, remaining: 5, hp: 90 });
  const all = [near, ahead, tough];

  it("first picks the enemy closest to the exit", () => {
    expect(TARGETING.first(all, origin)).toBe(ahead);
  });

  it("last picks the enemy furthest from the exit", () => {
    expect(TARGETING.last(all, origin)).toBe(near);
  });

  it("strongest picks the enemy with the most hp", () => {
    expect(TARGETING.strongest(all, origin)).toBe(tough);
  });

  it("closest picks the enemy nearest the tower", () => {
    expect(TARGETING.closest(all, origin)).toBe(near);
  });

  it("keeps the older enemy on ties and returns nothing for no candidates", () => {
    const twin = makeEnemy({ id: 9, hp: near.hp, x: 5 });
    expect(TARGETING.strongest([near, twin], origin)).toBe(near);
    expect(TARGETING.first([], origin)).toBeUndefined();
  });

  it("only considers living enemies within range", () => {
    const dead = makeEnemy({ id: 4, x: 1, y: 1, status: "killed" });
    expect(enemiesInRange([...all, dead], origin, 2)).toEqual([near, tough]);
  });
});
