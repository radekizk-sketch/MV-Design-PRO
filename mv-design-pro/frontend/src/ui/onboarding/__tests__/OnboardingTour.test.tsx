import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  OnboardingTour,
  TOUR_STEPS,
  isOnboardingCompleted,
  markOnboardingCompleted,
  resetOnboarding,
} from '../OnboardingTour';

describe('Onboarding storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('isOnboardingCompleted false default', () => {
    expect(isOnboardingCompleted()).toBe(false);
  });

  it('markOnboardingCompleted persistuje', () => {
    markOnboardingCompleted();
    expect(isOnboardingCompleted()).toBe(true);
  });

  it('resetOnboarding czyści state', () => {
    markOnboardingCompleted();
    resetOnboarding();
    expect(isOnboardingCompleted()).toBe(false);
  });
});

describe('TOUR_STEPS constant', () => {
  it('zawiera 6 kroków', () => {
    expect(TOUR_STEPS).toHaveLength(6);
  });

  it('każdy krok ma id/title/description/tipPl', () => {
    for (const step of TOUR_STEPS) {
      expect(step.id).toBeTruthy();
      expect(step.title).toBeTruthy();
      expect(step.description).toBeTruthy();
      expect(step.tipPl).toBeTruthy();
    }
  });

  it('zawiera kluczowe etapy workflow', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(ids).toContain('dashboard');
    expect(ids).toContain('sld');
    expect(ids).toContain('add-gpz');
    expect(ids).toContain('power-flow');
    expect(ids).toContain('osd-report');
  });
});

describe('OnboardingTour UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('nie renderuje gdy isOpen=false', () => {
    const { container } = render(<OnboardingTour isOpen={false} onClose={vi.fn()} />);
    expect(container.querySelector('[data-testid="onboarding-tour"]')).toBeNull();
  });

  it('start na kroku 1', () => {
    render(<OnboardingTour isOpen onClose={vi.fn()} />);
    expect(screen.getByText(/Krok 1 z 6/)).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-title')).toHaveTextContent('Pulpit projektu');
  });

  it('renderuje tip z emoji 💡', () => {
    render(<OnboardingTour isOpen onClose={vi.fn()} />);
    const tip = screen.getByTestId('onboarding-tip');
    expect(tip.textContent).toContain('💡');
  });

  it('Dalej przesuwa do kroku 2', () => {
    render(<OnboardingTour isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('onboarding-next'));
    expect(screen.getByText(/Krok 2 z 6/)).toBeInTheDocument();
  });

  it('Wstecz cofa do poprzedniego kroku', () => {
    render(<OnboardingTour isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('onboarding-next'));
    fireEvent.click(screen.getByTestId('onboarding-back'));
    expect(screen.getByText(/Krok 1 z 6/)).toBeInTheDocument();
  });

  it('ostatni krok: button "Zacznij projektować"', () => {
    render(<OnboardingTour isOpen onClose={vi.fn()} />);
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) {
      fireEvent.click(screen.getByTestId('onboarding-next'));
    }
    expect(screen.getByText(/Zacznij projektować/)).toBeInTheDocument();
  });

  it('ukończenie zaznacza w localStorage + onComplete', () => {
    const onComplete = vi.fn();
    const onClose = vi.fn();
    render(<OnboardingTour isOpen onClose={onClose} onComplete={onComplete} />);
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      fireEvent.click(screen.getByTestId('onboarding-next'));
    }
    expect(onComplete).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(isOnboardingCompleted()).toBe(true);
  });

  it('Pomiń przewodnik oznacza ukończony', () => {
    const onClose = vi.fn();
    render(<OnboardingTour isOpen onClose={onClose} />);
    fireEvent.click(screen.getByTestId('onboarding-skip'));
    expect(onClose).toHaveBeenCalled();
    expect(isOnboardingCompleted()).toBe(true);
  });

  it('progress bar zaznacza ukończone kroki', () => {
    render(<OnboardingTour isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('onboarding-next'));
    fireEvent.click(screen.getByTestId('onboarding-next'));
    // Krok 3 = i=2. Progress 0,1,2 powinny być aktywne (bg-blue-500)
    const progress2 = screen.getByTestId('onboarding-progress-2');
    expect(progress2.className).toContain('bg-blue-500');
  });
});
