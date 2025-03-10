import { Box, Image, SimpleGrid, Text } from "@chakra-ui/react"
import React from "react"

const PostezVotreOffreAlternance = () => {
  return (
    <Box as="section" mb={{ base: "2", md: "5" }}>
      <SimpleGrid columns={{ sm: 1, md: 2 }} spacing="40px" alignItems={"center"} mt={12}>
        <Box>
          <Text as="h2" variant="homeEditorialH2">
            Déposez des offres d’alternance pour vos entreprises partenaires
          </Text>
          <Box>
            <Text mt="3">3 étapes seulement pour mettre en ligne les besoins de vos entreprises partenaires.</Text>
            <Text>Vos offres regroupant formation et emploi seront mises en avant sur les différents sites.</Text>
          </Box>
        </Box>
        <Box order={{ base: "-1", md: "1" }}>
          <Image src="/images/home_pics/illu-offreemploi.svg" alt=""></Image>
        </Box>
      </SimpleGrid>
    </Box>
  )
}

export default PostezVotreOffreAlternance
