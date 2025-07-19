import { Button } from '@/components/ui/button'

export function GradientButton() {
  return (
    <Button
      className="bg-gradient-to-r from-[#4776E6] via-[#8E54E9] to-[#4776E6] 
                 bg-[length:200%_auto] text-white text-uppercase
                 transition-all duration-500 ease-in-out
                 shadow-md rounded-md px-8 py-4
                 hover:bg-[position:right_center] hover:text-white"
    >
      Gradient Button
    </Button>
  )
}
