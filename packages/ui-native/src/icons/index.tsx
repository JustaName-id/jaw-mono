import React from 'react';
import Svg, { Path, G, Rect, Defs, ClipPath } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface IconProps {
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  style?: ViewStyle;
}

export const CloseIcon: React.FC<IconProps> = ({
  width = 16,
  height = 16,
  stroke = '#18181B',
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <G opacity={0.7}>
        <Path
          d="M12 4L4 12M4 4L12 12"
          stroke={stroke}
          strokeWidth={1.33}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
};

export const WalletIcon: React.FC<IconProps> = ({
  width = 24,
  height = 25,
  stroke = '#71717A',
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 24 25"
      fill="none"
      style={style}
    >
      <Path
        d="M19 7.5V4.5C19 4.23478 18.8946 3.98043 18.7071 3.79289C18.5196 3.60536 18.2652 3.5 18 3.5H5C4.46957 3.5 3.96086 3.71071 3.58579 4.08579C3.21071 4.46086 3 4.96957 3 5.5M3 5.5C3 6.03043 3.21071 6.53914 3.58579 6.91421C3.96086 7.28929 4.46957 7.5 5 7.5H20C20.2652 7.5 20.5196 7.60536 20.7071 7.79289C20.8946 7.98043 21 8.23478 21 8.5V12.5M3 5.5V19.5C3 20.0304 3.21071 20.5391 3.58579 20.9142C3.96086 21.2893 4.46957 21.5 5 21.5H20C20.2652 21.5 20.5196 21.3946 20.7071 21.2071C20.8946 21.0196 21 20.7652 21 20.5V16.5M21 12.5H18C17.4696 12.5 16.9609 12.7107 16.5858 13.0858C16.2107 13.4609 16 13.9696 16 14.5C16 15.0304 16.2107 15.5391 16.5858 15.9142C16.9609 16.2893 17.4696 16.5 18 16.5H21M21 12.5C21.2652 12.5 21.5196 12.6054 21.7071 12.7929C21.8946 12.9804 22 13.2348 22 13.5V15.5C22 15.7652 21.8946 16.0196 21.7071 16.2071C21.5196 16.3946 21.2652 16.5 21 16.5"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export const CopyIcon: React.FC<IconProps> = ({
  width = 10,
  height = 10,
  stroke = '#71717A',
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 10 10"
      fill="none"
      style={style}
    >
      <G clipPath="url(#clip0_copy)">
        <Path
          d="M1.66665 6.66659C1.20831 6.66659 0.833313 6.29159 0.833313 5.83325V1.66659C0.833313 1.20825 1.20831 0.833252 1.66665 0.833252H5.83331C6.29165 0.833252 6.66665 1.20825 6.66665 1.66659M4.16665 3.33325H8.33331C8.79355 3.33325 9.16665 3.70635 9.16665 4.16659V8.33325C9.16665 8.79349 8.79355 9.16659 8.33331 9.16659H4.16665C3.70641 9.16659 3.33331 8.79349 3.33331 8.33325V4.16659C3.33331 3.70635 3.70641 3.33325 4.16665 3.33325Z"
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
      <Defs>
        <ClipPath id="clip0_copy">
          <Rect width={10} height={10} fill="white" />
        </ClipPath>
      </Defs>
    </Svg>
  );
};

export const CopiedIcon: React.FC<IconProps> = ({
  width = 24,
  height = 24,
  fill = '#71717A',
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
    >
      <Path
        fill={fill}
        d="m11.602 13.76 1.412 1.412 8.466-8.466 1.414 1.415-9.88 9.88-6.364-6.365 1.414-1.414 2.125 2.125zm.002-2.828 4.952-4.953 1.41 1.41-4.952 4.953zm-2.827 5.655L7.364 18 1 11.636l1.414-1.414 1.413 1.413-.001.001z"
      />
    </Svg>
  );
};

export const EyeIcon: React.FC<IconProps> = ({
  width = 16,
  height = 16,
  stroke = '#18181B',
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <Path
        d="M1.33337 8.00004C1.33337 8.00004 3.33337 3.33337 8.00004 3.33337C12.6667 3.33337 14.6667 8.00004 14.6667 8.00004C14.6667 8.00004 12.6667 12.6667 8.00004 12.6667C3.33337 12.6667 1.33337 8.00004 1.33337 8.00004Z"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8.00004 10C9.10461 10 10 9.10461 10 8.00004C10 6.89547 9.10461 6.00004 8.00004 6.00004C6.89547 6.00004 6.00004 6.89547 6.00004 8.00004C6.00004 9.10461 6.89547 10 8.00004 10Z"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export const BadgeDollarIcon: React.FC<IconProps> = ({
  width = 15,
  height = 15,
  stroke = '#18181B',
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 15 15"
      fill="none"
      style={style}
    >
      <Path
        d="M10.0907 4.74674H6.09066C5.73704 4.74674 5.3979 4.88722 5.14785 5.13727C4.8978 5.38732 4.75732 5.72646 4.75732 6.08008C4.75732 6.4337 4.8978 6.77284 5.14785 7.02289C5.3979 7.27294 5.73704 7.41341 6.09066 7.41341H8.75732C9.11095 7.41341 9.45008 7.55389 9.70013 7.80394C9.95018 8.05398 10.0907 8.39312 10.0907 8.74674C10.0907 9.10037 9.95018 9.4395 9.70013 9.68955C9.45008 9.9396 9.11095 10.0801 8.75732 10.0801H4.75732M7.42399 11.4134V3.41341M1.99062 5.16014C1.89332 4.72183 1.90826 4.26604 2.03406 3.83504C2.15986 3.40403 2.39246 3.01177 2.71027 2.69462C3.02808 2.37747 3.42083 2.14571 3.85209 2.02081C4.28336 1.89591 4.73918 1.88192 5.17729 1.98014C5.41843 1.60301 5.75063 1.29265 6.14326 1.07767C6.53589 0.862685 6.97632 0.75 7.42396 0.75C7.87159 0.75 8.31202 0.862685 8.70466 1.07767C9.09729 1.29265 9.42948 1.60301 9.67062 1.98014C10.1094 1.88149 10.566 1.89542 10.998 2.02062C11.4299 2.14582 11.8232 2.37824 12.1412 2.69625C12.4592 3.01425 12.6916 3.40752 12.8168 3.83948C12.942 4.27143 12.9559 4.72803 12.8573 5.16681C13.2344 5.40795 13.5448 5.74014 13.7598 6.13278C13.9747 6.52541 14.0874 6.96584 14.0874 7.41348C14.0874 7.86111 13.9747 8.30154 13.7598 8.69418C13.5448 9.08681 13.2344 9.419 12.8573 9.66014C12.9555 10.0983 12.9415 10.5541 12.8166 10.9853C12.6917 11.4166 12.46 11.8093 12.1428 12.1272C11.8257 12.445 11.4334 12.6776 11.0024 12.8034C10.5714 12.9292 10.1156 12.9441 9.67729 12.8468C9.43646 13.2254 9.10401 13.5371 8.71071 13.753C8.31741 13.969 7.87597 14.0822 7.42729 14.0822C6.97861 14.0822 6.53717 13.969 6.14387 13.753C5.75057 13.5371 5.41812 13.2254 5.17729 12.8468C4.73918 12.945 4.28336 12.931 3.85209 12.8061C3.42083 12.6812 3.02808 12.4495 2.71027 12.1323C2.39246 11.8152 2.15986 11.4229 2.03406 10.9919C1.90826 10.5609 1.89332 10.1051 1.99062 9.66681C1.61059 9.4263 1.29757 9.09359 1.08066 8.69962C0.863745 8.30565 0.75 7.86321 0.75 7.41348C0.75 6.96374 0.863745 6.52131 1.08066 6.12733C1.29757 5.73336 1.61059 5.40065 1.99062 5.16014Z"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export const LockIcon: React.FC<IconProps> = ({
  width = 16,
  height = 16,
  stroke = '#18181B',
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <Path
        d="M4.66667 6.66671V4.66671C4.66667 3.78265 5.01786 2.93481 5.64298 2.30968C6.2681 1.68456 7.11595 1.33337 8 1.33337C8.88406 1.33337 9.7319 1.68456 10.357 2.30968C10.9821 2.93481 11.3333 3.78265 11.3333 4.66671V6.66671M8.66667 10.6667C8.66667 11.0349 8.36819 11.3334 8 11.3334C7.63181 11.3334 7.33333 11.0349 7.33333 10.6667C7.33333 10.2985 7.63181 10 8 10C8.36819 10 8.66667 10.2985 8.66667 10.6667ZM3.33333 6.66671H12.6667C13.403 6.66671 14 7.26366 14 8.00004V13.3334C14 14.0698 13.403 14.6667 12.6667 14.6667H3.33333C2.59695 14.6667 2 14.0698 2 13.3334V8.00004C2 7.26366 2.59695 6.66671 3.33333 6.66671Z"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

// Chevron icons for select/accordion components
export const ChevronDownIcon: React.FC<IconProps> = ({
  width = 16,
  height = 16,
  stroke = '#18181B',
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
    >
      <Path
        d="M6 9L12 15L18 9"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export const ChevronUpIcon: React.FC<IconProps> = ({
  width = 16,
  height = 16,
  stroke = '#18181B',
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
    >
      <Path
        d="M18 15L12 9L6 15"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export const CheckIcon: React.FC<IconProps> = ({
  width = 16,
  height = 16,
  stroke = '#FFFFFF',
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
    >
      <Path
        d="M20 6L9 17L4 12"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export const WarningIcon: React.FC<IconProps> = ({
  width = 16,
  height = 16,
  stroke = '#F59E0B',
  fill = '#F59E0B',
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <Path
        d="M8 1.5L1 14.5H15L8 1.5Z"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8 6V9"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Svg x={7.5} y={11}>
        <Rect width={1} height={1} rx={0.5} fill={fill} />
      </Svg>
    </Svg>
  );
};

export const InfoIcon: React.FC<IconProps> = ({
  width = 16,
  height = 16,
  stroke = '#3B82F6',
  fill = '#3B82F6',
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="none"
      style={style}
    >
      <Svg x={7.5} y={4.5}>
        <Rect width={1} height={1} rx={0.5} fill={fill} />
      </Svg>
      <Path
        d="M8 7V11"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Svg x={1.25} y={1.25}>
        <Rect
          width={13.5}
          height={13.5}
          rx={6.75}
          stroke={stroke}
          strokeWidth={1.5}
          fill="none"
        />
      </Svg>
    </Svg>
  );
};

// Token Icons for Fee Token Selector

export const EthIcon: React.FC<IconProps> = ({
  width = 32,
  height = 32,
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 32 32"
      fill="none"
      style={style}
    >
      <G>
        <Path
          d="M16 32C24.8366 32 32 24.8366 32 16C32 7.16344 24.8366 0 16 0C7.16344 0 0 7.16344 0 16C0 24.8366 7.16344 32 16 32Z"
          fill="#627EEA"
        />
        <Path
          d="M16.498 4V12.87L23.995 16.22L16.498 4Z"
          fill="white"
          fillOpacity={0.602}
        />
        <Path d="M16.498 4L9 16.22L16.498 12.87V4Z" fill="white" />
        <Path
          d="M16.498 21.968V27.995L24 17.616L16.498 21.968Z"
          fill="white"
          fillOpacity={0.602}
        />
        <Path d="M16.498 27.995V21.967L9 17.616L16.498 27.995Z" fill="white" />
        <Path
          d="M16.498 20.573L23.995 16.22L16.498 12.872V20.573Z"
          fill="white"
          fillOpacity={0.2}
        />
        <Path
          d="M9 16.22L16.498 20.573V12.872L9 16.22Z"
          fill="white"
          fillOpacity={0.602}
        />
      </G>
    </Svg>
  );
};

export const UsdcIcon: React.FC<IconProps> = ({
  width = 32,
  height = 32,
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 32 32"
      fill="none"
      style={style}
    >
      <G>
        <Path
          d="M16 32C24.8366 32 32 24.8366 32 16C32 7.16344 24.8366 0 16 0C7.16344 0 0 7.16344 0 16C0 24.8366 7.16344 32 16 32Z"
          fill="#2775CA"
        />
        <Path
          d="M20.5 18.75C20.5 16.8125 19.375 15.9375 16.8125 15.5625L15.375 15.3125C13.9375 15.0625 13.4375 14.6875 13.4375 13.875C13.4375 13.0625 14.125 12.5625 15.375 12.5625C16.5 12.5625 17.25 12.875 17.6875 13.625C17.75 13.75 17.875 13.8125 18.0625 13.8125H18.875C19.125 13.8125 19.3125 13.625 19.3125 13.375V13.3125C19.0625 12.375 18.25 11.5625 17.0625 11.25V10.0625C17.0625 9.8125 16.875 9.625 16.625 9.5625H15.5625C15.3125 9.5625 15.125 9.75 15.0625 10V11.1875C13.3125 11.4375 12.125 12.5625 12.125 14.0625C12.125 15.9375 13.3125 16.8125 15.8125 17.1875L17.3125 17.4375C18.6875 17.6875 19.1875 18 19.1875 18.875C19.1875 19.75 18.375 20.375 17.1875 20.375C15.75 20.375 15.125 19.9375 14.8125 19.1875C14.75 19.0625 14.625 19 14.5 19H13.625C13.375 19 13.1875 19.1875 13.1875 19.4375V19.5C13.5 20.625 14.375 21.4375 15.5 21.75V22.9375C15.5 23.1875 15.6875 23.375 15.9375 23.4375H17C17.25 23.4375 17.4375 23.25 17.5 23V21.8125C19.3125 21.5625 20.5 20.4375 20.5 18.75ZM25.5625 16C25.5625 21.6875 21.125 26.3125 15.5 26.5C9.75 26.6875 5 22.0625 5 16.375C5 10.9375 9.3125 6.5 14.6875 6.5C20.1875 6.5 25.5625 10.4375 25.5625 16ZM27 16C27 9.5 21.5 4 15 4C8.5 4 3 9.5 3 16C3 22.5 8.5 28 15 28C21.5 28 27 22.5 27 16Z"
          fill="white"
        />
      </G>
    </Svg>
  );
};

export const UsdtIcon: React.FC<IconProps> = ({
  width = 32,
  height = 32,
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 32 32"
      fill="none"
      style={style}
    >
      <G>
        <Path
          d="M16 32C24.8366 32 32 24.8366 32 16C32 7.16344 24.8366 0 16 0C7.16344 0 0 7.16344 0 16C0 24.8366 7.16344 32 16 32Z"
          fill="#26A17B"
        />
        <Path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M17.9198 18.0576V18.0568C17.7353 18.0731 17.0784 18.1173 15.9988 18.1173C15.1018 18.1173 14.3628 18.0814 14.073 18.0568V18.0577C10.1935 17.8675 7.34241 17.177 7.34241 16.3525C7.34241 15.5279 10.1935 14.8382 14.073 14.6472V17.5922C14.3674 17.6222 15.1226 17.6735 15.9988 17.6735C16.997 17.6735 17.7232 17.6176 17.9198 17.5922V14.6472C21.7993 14.8374 24.6503 15.5279 24.6503 16.3525C24.6503 17.177 21.7993 17.8675 17.9198 18.0576ZM17.9198 14.4885V11.52H22.1728V7.5H9.82241V11.52H14.073V14.4885C9.70829 14.6998 6.5 15.5196 6.5 16.4998C6.5 17.48 9.70829 18.2999 14.073 18.5111V25.5H17.9198V18.5111C22.2846 18.2999 25.4928 17.48 25.4928 16.4998C25.4928 15.5196 22.2846 14.6998 17.9198 14.4885Z"
          fill="white"
        />
      </G>
    </Svg>
  );
};

export const GenericTokenIcon: React.FC<IconProps> = ({
  width = 32,
  height = 32,
  style,
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 32 32"
      fill="none"
      style={style}
    >
      <G>
        <Path
          d="M16 32C24.8366 32 32 24.8366 32 16C32 7.16344 24.8366 0 16 0C7.16344 0 0 7.16344 0 16C0 24.8366 7.16344 32 16 32Z"
          fill="#71717A"
        />
        <Path
          d="M16 24C20.4183 24 24 20.4183 24 16C24 11.5817 20.4183 8 16 8C11.5817 8 8 11.5817 8 16C8 20.4183 11.5817 24 16 24Z"
          stroke="white"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
};
