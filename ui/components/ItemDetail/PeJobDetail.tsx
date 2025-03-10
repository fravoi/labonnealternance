import { Box, Text } from "@chakra-ui/react"
import mdIt from "markdown-it"
import React, { useEffect } from "react"
import ReactHtmlParser from "react-html-parser"

import { DisplayContext } from "../../context/DisplayContextProvider"
import { SendPlausibleEvent } from "../../utils/plausible"
import { formatDate } from "../../utils/strutils"

const md = mdIt().disable(["link", "image"])

const PeJobDetail = ({ job }) => {
  useEffect(() => {
    // S'assurer que l'utilisateur voit bien le haut de la fiche au départ
    document.getElementsByClassName("choiceCol")[0].scrollTo(0, 0)
  }, []) // Utiliser le useEffect une seule fois : https://css-tricks.com/run-useeffect-only-once/

  useEffect(() => {
    SendPlausibleEvent("Affichage - Fiche entreprise Offre PE", {
      info_fiche: `${job?.job?.id}${formValues?.job?.label ? ` - ${formValues.job.label}` : ""}`,
    })
  }, [job?.job?.id])

  const { formValues } = React.useContext(DisplayContext)

  const description = job?.job?.description
  const contractDuration = job?.job?.contractDescription
  const contractRythm = job?.job?.duration || "Non défini"
  const creationDate = formatDate(job?.job?.creationDate)

  return (
    <Box pb="0px" mt={6} position="relative" background="white" padding="16px 24px" mx={["0", "30px"]}>
      <Text as="h2" variant="itemDetailH2" mt={2} mb={4}>
        Description de l&apos;offre
      </Text>
      <Box p={4} mb={6} borderRadius="8px" background="#f6f6f6">
        <Box mb={2}>
          <strong>Publiée le : </strong> {creationDate}
        </Box>
        <Box mb={2}>
          <strong>Nature du contrat : </strong> Alternance
        </Box>
        <Box mb={2}>
          <strong>Durée :</strong> {contractDuration}
        </Box>
        <Box>
          <strong>Rythme :</strong> {contractRythm}
        </Box>
      </Box>
      {description && (
        <Box mt={8}>
          <Box whiteSpace="pre-wrap" pl={4}>
            {ReactHtmlParser(md.render(description))}
          </Box>
        </Box>
      )}
    </Box>
  )
}

export default PeJobDetail
