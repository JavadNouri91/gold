declare module 'react-iranian-bank-logo' {
  import type { ImgHTMLAttributes } from 'react';

  export type IranianBankProps = ImgHTMLAttributes<HTMLImageElement> & {
    name?: string | null;
    size?: number;
  };

  export const IranianBank: (props: IranianBankProps) => JSX.Element;
}
