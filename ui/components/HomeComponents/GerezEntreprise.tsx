import { Box, Image, SimpleGrid, Text } from "@chakra-ui/react"
import React from "react"

const GerezEntreprise = () => {
  return (
    <Box as="section" py={3} mb={{ base: "2", md: "5" }}>
      <SimpleGrid columns={{ sm: 1, md: 2 }} spacing="40px" alignItems={"center"} mt={12}>
        <Box>
          <Image src="/images/home_pics/illu-listeoffres.svg" alt=""></Image>
        </Box>
        <Box>
          <Text as="h2" variant="homeEditorialH2">
            Gérez vos entreprises partenaires et leurs offres grâce à un tableau de bord
          </Text>
          <Text>Modifiez les offres, recevez les candidatures et préqualifiez les candidats pour vos entreprises et vos formations.</Text>
        </Box>
      </SimpleGrid>
    </Box>
  )
}

export default GerezEntreprise
