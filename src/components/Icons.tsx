import {
  Svg,
  G,
  Path,
  Circle,
  Rect,
  Line,
  Polyline,
  Polygon,
  SvgProps,
} from 'react-native-svg';

export interface IconProps extends SvgProps {
  size?: number;
  color?: string;
}

const defaultProps = {
  size: 24,
  color: '#cbd5e1',
  strokeWidth: 2,
};

function createIcon(renderChildren: (color: string) => React.ReactNode) {
  const IconComponent = ({
    size = defaultProps.size,
    color = defaultProps.color,
    strokeWidth = defaultProps.strokeWidth,
    style,
    ...props
  }: IconProps) => {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={style}
        {...props}
      >
        <G>{renderChildren(color)}</G>
      </Svg>
    );
  };
  return IconComponent;
}

export const Shield = createIcon(() => (
  <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
));

export const ShieldCheck = createIcon(() => (
  <>
    <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <Path d="m9 12 2 2 4-4" />
  </>
));

export const ShieldAlert = createIcon(() => (
  <>
    <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <Line x1="12" y1="8" x2="12" y2="12" />
    <Line x1="12" y1="16" x2="12.01" y2="16" />
  </>
));

export const Lock = createIcon(() => (
  <>
    <Rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>
));

export const Key = createIcon(() => (
  <>
    <Circle cx="7.5" cy="15.5" r="5.5" />
    <Path d="m21 2-9.6 9.6" />
    <Path d="m15.5 7.5 3 3L22 7l-3-3" />
  </>
));

export const KeyRound = createIcon(() => (
  <>
    <Path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
    <Circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
  </>
));

export const Ticket = createIcon(() => (
  <>
    <Path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <Path d="M13 5v2" />
    <Path d="M13 17v2" />
    <Path d="M13 11v2" />
  </>
));

export const Laptop = createIcon(() => (
  <>
    <Path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16" />
  </>
));

export const Smartphone = createIcon(() => (
  <>
    <Rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
    <Path d="M12 18h.01" />
  </>
));

export const Tablet = createIcon(() => (
  <>
    <Rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
    <Line x1="12" y1="18" x2="12.01" y2="18" />
  </>
));

export const Globe = createIcon(() => (
  <>
    <Circle cx="12" cy="12" r="10" />
    <Path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <Path d="M2 12h20" />
  </>
));

export const Cloud = createIcon(() => (
  <Path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
));

export const Settings = createIcon(() => (
  <>
    <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <Circle cx="12" cy="12" r="3" />
  </>
));

export const Search = createIcon(() => (
  <>
    <Circle cx="11" cy="11" r="8" />
    <Path d="m21 21-4.3-4.3" />
  </>
));

export const Pin = createIcon(() => (
  <>
    <Line x1="12" y1="17" x2="12" y2="22" />
    <Path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
  </>
));

export const Flame = createIcon(() => (
  <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
));

export const Plus = createIcon(() => (
  <>
    <Path d="M5 12h14" />
    <Path d="M12 5v14" />
  </>
));

export const CheckCircle = createIcon(() => (
  <>
    <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <Path d="m9 11 3 3L22 4" />
  </>
));

export const CheckCircle2 = createIcon(() => (
  <>
    <Circle cx="12" cy="12" r="10" />
    <Path d="m9 12 2 2 4-4" />
  </>
));

export const Check = createIcon(() => (
  <Path d="M20 6 9 17l-5-5" />
));

export const CheckCheck = createIcon(() => (
  <>
    <Path d="M18 6 7 17l-5-5" />
    <Path d="m22 10-7.5 7.5L13 16" />
  </>
));

export const UserPlus = createIcon(() => (
  <>
    <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <Circle cx="9" cy="7" r="4" />
    <Line x1="19" y1="8" x2="19" y2="14" />
    <Line x1="22" y1="11" x2="16" y2="11" />
  </>
));

export const User = createIcon(() => (
  <>
    <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <Circle cx="12" cy="7" r="4" />
  </>
));

export const ArrowLeft = createIcon(() => (
  <>
    <Path d="m12 19-7-7 7-7" />
    <Path d="M19 12H5" />
  </>
));

export const ArrowRight = createIcon(() => (
  <>
    <Path d="M5 12h14" />
    <Path d="m12 5 7 7-7 7" />
  </>
));

export const Phone = createIcon(() => (
  <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
));

export const PhoneOff = createIcon(() => (
  <>
    <Path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
    <Line x1="2" y1="2" x2="22" y2="22" />
  </>
));

export const Video = createIcon(() => (
  <>
    <Path d="m22 8-6 4 6 4V8Z" />
    <Rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
  </>
));

export const VideoOff = createIcon(() => (
  <>
    <Path d="M10.66 6H14a2 2 0 0 1 2 2v2.34l1 1L22 8v8" />
    <Path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2l10 10Z" />
    <Line x1="2" y1="2" x2="22" y2="22" />
  </>
));

export const Mic = createIcon(() => (
  <>
    <Path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <Line x1="12" y1="19" x2="12" y2="22" />
  </>
));

export const MicOff = createIcon(() => (
  <>
    <Line x1="2" y1="2" x2="22" y2="22" />
    <Path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
    <Path d="M5 10v2a7 7 0 0 0 12 5" />
    <Path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <Path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <Line x1="12" y1="19" x2="12" y2="22" />
  </>
));

export const Volume2 = createIcon(() => (
  <>
    <Polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <Path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <Path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </>
));

export const VolumeX = createIcon(() => (
  <>
    <Polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <Line x1="22" y1="9" x2="16" y2="15" />
    <Line x1="16" y1="9" x2="22" y2="15" />
  </>
));

export const SwitchCamera = createIcon(() => (
  <>
    <Path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
    <Path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
    <Circle cx="12" cy="12" r="3" />
    <Path d="m18 22-3-3 3-3" />
    <Path d="m6 2 3 3-3 3" />
  </>
));

export const Trash2 = createIcon(() => (
  <>
    <Path d="M3 6h18" />
    <Path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <Path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <Line x1="10" y1="11" x2="10" y2="17" />
    <Line x1="14" y1="11" x2="14" y2="17" />
  </>
));

export const Paperclip = createIcon(() => (
  <Path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
));

export const Send = createIcon(() => (
  <>
    <Path d="m22 2-7 20-4-9-9-4Z" />
    <Path d="M22 2 11 13" />
  </>
));

export const Radio = createIcon(() => (
  <>
    <Circle cx="12" cy="12" r="2" />
    <Path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
  </>
));

export const Play = createIcon((color) => (
  <Polygon points="5 3 19 12 5 21 5 3" fill={color} />
));

export const Pause = createIcon((color) => (
  <>
    <Rect width="4" height="16" x="6" y="4" fill={color} />
    <Rect width="4" height="16" x="14" y="4" fill={color} />
  </>
));

export const Copy = createIcon(() => (
  <>
    <Rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <Path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </>
));

export const X = createIcon(() => (
  <>
    <Path d="M18 6 6 18" />
    <Path d="m6 6 12 12" />
  </>
));

export const Cpu = createIcon(() => (
  <>
    <Rect width="16" height="16" x="4" y="4" rx="2" />
    <Rect width="6" height="6" x="9" y="9" rx="1" />
    <Path d="M15 2v2" />
    <Path d="M15 20v2" />
    <Path d="M2 15h2" />
    <Path d="M2 9h2" />
    <Path d="M20 15h2" />
    <Path d="M20 9h2" />
    <Path d="M9 2v2" />
    <Path d="M9 20v2" />
  </>
));

export const QrCode = createIcon(() => (
  <>
    <Rect width="5" height="5" x="3" y="3" rx="1" />
    <Rect width="5" height="5" x="16" y="3" rx="1" />
    <Rect width="5" height="5" x="3" y="16" rx="1" />
    <Path d="M21 16h-3a2 2 0 0 0-2 2v3" />
    <Path d="M21 21v.01" />
    <Path d="M12 7v3a2 2 0 0 1-2 2H7" />
    <Path d="M3 12h.01" />
    <Path d="M12 3h.01" />
    <Path d="M12 16v.01" />
    <Path d="M16 12h1" />
    <Path d="M21 12v.01" />
    <Path d="M12 21v-1" />
  </>
));

export const Eye = createIcon(() => (
  <>
    <Path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <Circle cx="12" cy="12" r="3" />
  </>
));

export const EyeOff = createIcon(() => (
  <>
    <Path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <Path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <Path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <Line x1="2" y1="2" x2="22" y2="22" />
  </>
));

export const ChevronRight = createIcon(() => (
  <Path d="m9 18 6-6-6-6" />
));

export const Fingerprint = createIcon(() => (
  <>
    <Path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <Path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <Path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <Path d="M2 12a10 10 0 0 1 18-6" />
    <Path d="M2 16h.01" />
    <Path d="M21.8 16c.2-2 .131-5.354 0-6" />
    <Path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
    <Path d="M8.65 22c.21-.66.45-1.32.57-2" />
    <Path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
  </>
));

export const Download = createIcon(() => (
  <>
    <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <Polyline points="7 10 12 15 17 10" />
    <Line x1="12" y1="15" x2="12" y2="3" />
  </>
));

export const RefreshCw = createIcon(() => (
  <>
    <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <Path d="M21 3v5h-5" />
    <Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <Path d="M8 16H3v5" />
  </>
));

export const MoreVertical = createIcon(() => (
  <>
    <Circle cx="12" cy="12" r="1" />
    <Circle cx="12" cy="5" r="1" />
    <Circle cx="12" cy="19" r="1" />
  </>
));

export const Info = createIcon(() => (
  <>
    <Circle cx="12" cy="12" r="10" />
    <Path d="M12 16v-4" />
    <Path d="M12 8h.01" />
  </>
));

export const LogOut = createIcon(() => (
  <>
    <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <Polyline points="16 17 21 12 16 7" />
    <Line x1="21" y1="12" x2="9" y2="12" />
  </>
));

export const Clock = createIcon(() => (
  <>
    <Circle cx="12" cy="12" r="10" />
    <Polyline points="12 6 12 12 16 14" />
  </>
));

export const UserCheck = createIcon(() => (
  <>
    <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <Circle cx="9" cy="7" r="4" />
    <Polyline points="16 11 18 13 22 9" />
  </>
));

export const Camera = createIcon(() => (
  <>
    <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <Circle cx="12" cy="13" r="3" />
  </>
));

export const ImageIcon = createIcon(() => (
  <>
    <Rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <Circle cx="9" cy="9" r="2" />
    <Path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </>
));

export const UserX = createIcon(() => (
  <>
    <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <Circle cx="9" cy="7" r="4" />
    <Line x1="17" y1="8" x2="22" y2="13" />
    <Line x1="22" y1="8" x2="17" y2="13" />
  </>
));

export const Bell = createIcon(() => (
  <>
    <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </>
));

export const BellOff = createIcon(() => (
  <>
    <Path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" />
    <Path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" />
    <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    <Line x1="1" y1="1" x2="23" y2="23" />
  </>
));

export const Sparkles = createIcon(() => (
  <>
    <Path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <Path d="M5 3v4" />
    <Path d="M19 17v4" />
    <Path d="M3 5h4" />
    <Path d="M17 19h4" />
  </>
));

export const ExternalLink = createIcon(() => (
  <>
    <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <Polyline points="15 3 21 3 21 9" />
    <Line x1="10" y1="14" x2="21" y2="3" />
  </>
));
