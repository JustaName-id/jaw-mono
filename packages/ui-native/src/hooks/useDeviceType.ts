import { useState, useEffect } from 'react';
import { Dimensions, ScaledSize } from 'react-native';

export type DeviceType = 'phone' | 'tablet';

interface DeviceTypeInfo {
  deviceType: DeviceType;
  isPhone: boolean;
  isTablet: boolean;
  width: number;
  height: number;
}

/**
 * Determines if the device is a tablet based on screen dimensions
 * Tablets are typically defined as having a shortest dimension > 600dp
 */
const getDeviceType = (dimensions: ScaledSize): DeviceType => {
  const { width, height } = dimensions;
  const shortestDimension = Math.min(width, height);

  // Common tablet breakpoint (600dp)
  return shortestDimension > 600 ? 'tablet' : 'phone';
};

/**
 * Custom hook to detect device type (phone vs tablet)
 * Useful for responsive layouts in React Native
 *
 * @returns DeviceTypeInfo - Object containing device type and boolean flags
 */
export const useDeviceType = (): DeviceTypeInfo => {
  const [dimensions, setDimensions] = useState<ScaledSize>(
    Dimensions.get('window')
  );

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const deviceType = getDeviceType(dimensions);

  return {
    deviceType,
    isPhone: deviceType === 'phone',
    isTablet: deviceType === 'tablet',
    width: dimensions.width,
    height: dimensions.height,
  };
};

/**
 * Non-reactive version for one-time checks
 */
export const getDeviceTypeSync = (): DeviceTypeInfo => {
  const dimensions = Dimensions.get('window');
  const deviceType = getDeviceType(dimensions);

  return {
    deviceType,
    isPhone: deviceType === 'phone',
    isTablet: deviceType === 'tablet',
    width: dimensions.width,
    height: dimensions.height,
  };
};
