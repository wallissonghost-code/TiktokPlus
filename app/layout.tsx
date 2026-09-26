import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata={title:"TikTok Plus — Analytics",description:"Uma nova forma de entender o desempenho do seu conteúdo."};
export const viewport: Viewport={width:"device-width",initialScale:1,maximumScale:1,userScalable:false,viewportFit:"cover",themeColor:"#070709"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}