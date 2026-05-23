import { describe, expect, it, beforeEach } from 'vitest';
import { useDialogManager } from '../DialogManager';

function reset() {
  useDialogManager.setState({ stack: [] });
}

describe('DialogManager', () => {
  beforeEach(reset);

  it('open dodaje dialog do stosu z rosnącym z-index', () => {
    useDialogManager.getState().open({
      id: 'a',
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => {},
    });
    useDialogManager.getState().open({
      id: 'b',
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => {},
    });

    const stack = useDialogManager.getState().stack;
    expect(stack).toHaveLength(2);
    expect(stack[0].zIndex).toBeLessThan(stack[1].zIndex);
  });

  it('open idempotent gdy id się duplikuje', () => {
    useDialogManager.getState().open({
      id: 'a',
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => {},
    });
    useDialogManager.getState().open({
      id: 'a',
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => {},
    });

    expect(useDialogManager.getState().stack).toHaveLength(1);
  });

  it('close usuwa dialog ze stosu i wywołuje onClose', () => {
    let closed = false;
    useDialogManager.getState().open({
      id: 'a',
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => {
        closed = true;
      },
    });
    useDialogManager.getState().close('a');

    expect(useDialogManager.getState().stack).toHaveLength(0);
    expect(closed).toBe(true);
  });

  it('closeTop zamyka dialog na wierzchu', () => {
    const closed: string[] = [];
    useDialogManager.getState().open({
      id: 'a',
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => closed.push('a'),
    });
    useDialogManager.getState().open({
      id: 'b',
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => closed.push('b'),
    });

    useDialogManager.getState().closeTop();
    expect(closed).toEqual(['b']);
    expect(useDialogManager.getState().stack).toHaveLength(1);
  });

  it('closeAll zamyka wszystkie w kolejności LIFO', () => {
    const closed: string[] = [];
    useDialogManager.getState().open({
      id: 'a',
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => closed.push('a'),
    });
    useDialogManager.getState().open({
      id: 'b',
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => closed.push('b'),
    });

    useDialogManager.getState().closeAll();
    expect(closed).toEqual(['b', 'a']);
    expect(useDialogManager.getState().stack).toHaveLength(0);
  });

  it('topId zwraca id top dialogu albo null', () => {
    expect(useDialogManager.getState().topId()).toBe(null);

    useDialogManager.getState().open({
      id: 'a',
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => {},
    });
    expect(useDialogManager.getState().topId()).toBe('a');

    useDialogManager.getState().open({
      id: 'b',
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => {},
    });
    expect(useDialogManager.getState().topId()).toBe('b');
  });
});
