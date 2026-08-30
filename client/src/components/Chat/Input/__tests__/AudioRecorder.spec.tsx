import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AudioRecorder from '../AudioRecorder';

type MockButtonProps = React.ComponentProps<'button'> & {
  label?: string;
  variant?: string;
  size?: string;
  shape?: string;
};

jest.mock('@librechat/client', () => ({
  IconButton: ({
    children,
    label,
    variant: _variant,
    size: _size,
    shape: _shape,
    ...props
  }: MockButtonProps) => (
    <button aria-label={label} {...props}>
      {children}
    </button>
  ),
  TooltipAnchor: ({ render }: { render: React.ReactElement }) => render,
  ListeningIcon: () => <span data-testid="listening-icon" />,
  StopRecordingIcon: () => <span data-testid="stop-recording-icon" />,
  Spinner: () => <span data-testid="spinner" />,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const renderRecorder = (props?: Partial<React.ComponentProps<typeof AudioRecorder>>) => {
  const onStart = jest.fn();
  const onStop = jest.fn();

  render(
    <AudioRecorder
      disabled={false}
      isListening={false}
      isLoading={false}
      onStart={onStart}
      onStop={onStop}
      {...props}
    />,
  );

  return { onStart, onStop };
};

describe('AudioRecorder', () => {
  it('starts recording from the idle state', () => {
    const { onStart, onStop } = renderRecorder();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_use_micrphone' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
    expect(screen.getByTestId('listening-icon')).toBeInTheDocument();
  });

  it('stops recording from the listening state', () => {
    const { onStart, onStop } = renderRecorder({ isListening: true });

    const button = screen.getByRole('button', { name: 'com_ui_stop_recording' });
    fireEvent.click(button);

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('stop-recording-icon')).toBeInTheDocument();
  });

  it('shows loading and blocks starting while idle', () => {
    const { onStart } = renderRecorder({ isLoading: true });

    const button = screen.getByRole('button', { name: 'com_ui_use_micrphone' });

    expect(button).toBeDisabled();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    fireEvent.click(button);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('does not disable the stop action while listening', () => {
    const { onStop } = renderRecorder({ disabled: true, isListening: true });

    const button = screen.getByRole('button', { name: 'com_ui_stop_recording' });
    fireEvent.click(button);

    expect(button).not.toBeDisabled();
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
