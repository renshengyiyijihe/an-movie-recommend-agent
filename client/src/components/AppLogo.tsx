interface AppLogoProps {
  className?: string;
  size?: number;
  alt?: string;
}

export default function AppLogo({ className = '', size = 24, alt = 'AI 泡面推荐图标' }: AppLogoProps) {
  return <img src="/favicon.svg" alt={alt} className={className} width={size} height={size} />;
}
