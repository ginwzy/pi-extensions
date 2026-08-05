export type RegistrationKind =
  | "tool"
  | "command"
  | "shortcut"
  | "flag"
  | "provider"
  | "message-renderer"
  | "entry-renderer";

export class RegistrationCollisionError extends Error {
  constructor(kind: RegistrationKind, name: string, owner: string, contender: string) {
    super(
      `Cannot register ${kind} ${JSON.stringify(name)} for module ${JSON.stringify(contender)}; ` +
        `it is already owned by module ${JSON.stringify(owner)}`,
    );
    this.name = "RegistrationCollisionError";
  }
}

export class OwnershipLedger {
  private readonly owners = new Map<string, string>();

  claim(kind: RegistrationKind, name: string, moduleId: string): boolean {
    const key = `${kind}\0${name}`;
    const owner = this.owners.get(key);
    if (owner && owner !== moduleId) {
      throw new RegistrationCollisionError(kind, name, owner, moduleId);
    }
    this.owners.set(key, moduleId);
    return owner === undefined;
  }

  ownerOf(kind: RegistrationKind, name: string): string | undefined {
    return this.owners.get(`${kind}\0${name}`);
  }

  release(kind: RegistrationKind, name: string, moduleId: string): boolean {
    const key = `${kind}\0${name}`;
    if (this.owners.get(key) !== moduleId) return false;
    return this.owners.delete(key);
  }
}
