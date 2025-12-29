import { styleText } from 'util'

export const green = (text: string): string => styleText('green', text)
export const bold = (text: string): string => styleText('bold', text)
export const red = (text: string): string => styleText('red', text)
export const yellow = (text: string): string => styleText('yellow', text)
export const gray = (text: string): string => styleText('gray', text)
export const dim = (text: string): string => styleText('dim', text)
