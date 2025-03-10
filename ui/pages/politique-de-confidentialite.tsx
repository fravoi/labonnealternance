import { Box, Container, Divider, SimpleGrid, Text } from "@chakra-ui/react"
import { NextSeo } from "next-seo"
import React from "react"
import { NotionRenderer } from "react-notion-x"

import Breadcrumb from "../components/breadcrumb"
import Footer from "../components/footer"
import Navigation from "../components/navigation"
import ScrollToTop from "../components/ScrollToTop"
import { publicConfig } from "../config.public"
import { fetchNotionPage } from "../services/fetchNotionPage"

export async function getStaticProps() {
  const recordMap = await fetchNotionPage("2d7d9cda6d9a4059baa84eacff592139")
  return {
    props: {
      recordMap,
    },
  }
}

const PolitiqueDeConfidentialite = ({ recordMap }) => {
  return (
    <Box>
      <NextSeo
        title="Politique de confidentialité | La bonne alternance | Trouvez votre alternance"
        description="Politique de confidentialité, traitement des données à caractère personnel sur le site de La bonne alternance."
      />
      <ScrollToTop />
      <Navigation />
      <Breadcrumb forPage="politique-de-confidentialite" label="Politique de confidentialité" />
      <Container p={12} my={0} mb={[0, 12]} variant="pageContainer">
        <SimpleGrid columns={[1, 1, 1, 2]}>
          <Box>
            <Box as="h1">
              <Text as="span" display="block" mb={1} variant="editorialContentH1" color="#2a2a2a">
                Politique
              </Text>
              <Text as="span" display="block" mb={1} variant="editorialContentH1">
                de confidentialité
              </Text>
            </Box>
            <Divider variant="pageTitleDivider" my={12} />
          </Box>
          <NotionRenderer recordMap={recordMap} fullPage={false} darkMode={false} disableHeader={true} rootDomain={publicConfig.baseUrl} className="disable-chakra" />
        </SimpleGrid>
      </Container>
      <Footer />
    </Box>
  )
}

export default PolitiqueDeConfidentialite
