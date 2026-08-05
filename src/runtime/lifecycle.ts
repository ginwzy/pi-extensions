type Disposer = () => void | Promise<void>;

interface TrackedDisposer {
  moduleId: string;
  active: boolean;
  dispose: Disposer;
}

export class LifecycleRegistry {
  private readonly entries: TrackedDisposer[] = [];

  track(moduleId: string, dispose: Disposer): Disposer {
    const entry: TrackedDisposer = { moduleId, active: true, dispose };
    this.entries.push(entry);

    return () => {
      if (!entry.active) return;
      entry.active = false;
      return entry.dispose();
    };
  }

  async disposeModule(moduleId: string): Promise<void> {
    await this.disposeEntries((entry) => entry.moduleId === moduleId);
  }

  async disposeAll(): Promise<void> {
    await this.disposeEntries(() => true);
  }

  private async disposeEntries(matches: (entry: TrackedDisposer) => boolean): Promise<void> {
    const errors: unknown[] = [];

    for (const entry of [...this.entries].reverse()) {
      if (!entry.active || !matches(entry)) continue;
      entry.active = false;
      try {
        await entry.dispose();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more All-in-One module disposers failed");
    }
  }
}
