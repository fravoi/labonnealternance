import { Box, Image } from "@chakra-ui/react"
import { useRouter } from "next/router"
import React, { useEffect } from "react"

import Footer from "../components/footer"
import AlgoHome from "../components/HomeComponents/AlgoHome"
import AmeliorerLBA from "../components/HomeComponents/AmeliorerLBA"
import HomeHero from "../components/HomeHero"
import HowTo from "../components/HowTo"
import Navigation from "../components/navigation"
import ScrollToTop from "../components/ScrollToTop"
import config from "../config/config"
import { ParameterContext } from "../context/ParameterContextProvider"
import { initParametersFromQuery } from "../services/config"

const blockCssProperties = {
  position: "relative",
  borderRadius: "10px",
  marginLeft: "auto",
  marginRight: "auto",
  maxWidth: "1310px",
}

const circleImgCssProperties = {
  position: "absolute",
  zIndex: 0,
  display: {
    base: "none",
    lg: "block",
  },
}

const Home = () => {
  const router = useRouter()

  const parameterContext = React.useContext(ParameterContext)

  useEffect(() => {
    initParametersFromQuery({ router, shouldPush: "shouldPushPathname", parameterContext })
  }, [])

  return (
    <Box>
      <ScrollToTop />
      <Navigation />
      {/* @ts-expect-error: TODO */}
      <Box background="beige" {...blockCssProperties}>
        {/* @ts-expect-error: TODO */}
        <Image src="/images/howtocircle1.svg" {...circleImgCssProperties} top="60px" left="50px" alt="" />
        {/* @ts-expect-error: TODO */}
        <Image src="/images/howtocircle2.svg" {...circleImgCssProperties} bottom="-28px" left="444px" alt="" />
        {/* @ts-expect-error: TODO */}
        <Image src="/images/howtocircle3.svg" {...circleImgCssProperties} top="182px" right="512px" alt="" />
        {/* @ts-expect-error: TODO */}
        <Image src="/images/howtocircle4.svg" {...circleImgCssProperties} top="12px" right="312px" alt="" />
        {/* @ts-expect-error: TODO */}
        <Image src="/images/howtocircle5.svg" {...circleImgCssProperties} bottom="112px" right="-12px" alt="" />
        <HomeHero />
        <HowTo />
      </Box>
      {/* @ts-expect-error: TODO */}
      <Box {...blockCssProperties} py={12}>
        <AlgoHome />
      </Box>

      {config.shouldDisplayCallForHelp && (
        // @ts-expect-error: TODO
        <Box {...blockCssProperties}>
          <AmeliorerLBA />
        </Box>
      )}
      <Footer />
    </Box>
  )
}

export default Home
