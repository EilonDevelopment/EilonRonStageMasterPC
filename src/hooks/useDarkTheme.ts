import {
    ThemeDetection,
    ThemeDetectionResponse,
  } from "@ionic-native/theme-detection";
  import {useState} from "react";
  
  const useDarkTheme = () => {
    const [isDark, setIsDark] = useState(
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  
    ThemeDetection.isAvailable()
      .then((res: ThemeDetectionResponse) => {
        if (res.value) {
          ThemeDetection.isDarkModeEnabled()
            .then((res: ThemeDetectionResponse) => {
              setIsDark(res.value);
            })
            .catch((error: any) => console.error(error));
        }
      })
      .catch((error: any) => {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
        prefersDark.addEventListener("change", (mediaQuery) => {
          setIsDark(mediaQuery.matches);
        });
      });
  
    return isDark;
  };
  
  export default useDarkTheme;