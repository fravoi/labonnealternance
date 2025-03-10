import { ExternalLinkIcon } from "@chakra-ui/icons"
import { Box, Flex, Image, Link, Text } from "@chakra-ui/react"
import React, { useEffect } from "react"
import { ILbaItemLbaJob } from "shared"

import { DisplayContext } from "../../context/DisplayContextProvider"
import { notifyLbaJobDetailView } from "../../services/notifyLbaJobDetailView"
import { SendPlausibleEvent } from "../../utils/plausible"
import { formatDate } from "../../utils/strutils"

import MatchaAcces from "./MatchaComponents/MatchaAcces"
import MatchaCompetences from "./MatchaComponents/MatchaCompetences"
import MatchaCustomDescription from "./MatchaComponents/MatchaCustomDescription"
import MatchaDescription from "./MatchaComponents/MatchaDescription"

const BADDESCRIPTION = 50

const getContractTypes = (contractTypes) => {
  return contractTypes instanceof Array ? contractTypes.join(", ") : contractTypes
}

const RomeDescriptions = (job) => (
  <>
    <MatchaDescription job={job} />
    <MatchaCompetences job={job} />
    <MatchaAcces job={job} />
  </>
)

const getDescriptionContext = (job: ILbaItemLbaJob) => {
  const { description, employeurDescription } = job.job

  if (description && description.length > BADDESCRIPTION && !employeurDescription) {
    return <MatchaCustomDescription data={description} title="Description du Métier" />
  }
  if (description && description.length > BADDESCRIPTION && employeurDescription) {
    return (
      <>
        <MatchaCustomDescription data={description} title="Description du Métier" />
        <MatchaCustomDescription data={employeurDescription} title="Description de l'employeur" />
      </>
    )
  }
  if ((!description || description.length < BADDESCRIPTION) && employeurDescription) {
    return (
      <>
        <MatchaCustomDescription data={employeurDescription} title="Description de l'employeur" />
      </>
    )
  }

  return RomeDescriptions(job)
}

const MatchaDetail = ({ job }) => {
  useEffect(() => {
    // S'assurer que l'utilisateur voit bien le haut de la fiche au départ
    document.getElementsByClassName("choiceCol")[0].scrollTo(0, 0)
  }, []) // Utiliser le useEffect une seule fois : https://css-tricks.com/run-useeffect-only-once/

  useEffect(() => {
    SendPlausibleEvent("Affichage - Fiche entreprise Offre LBA", {
      info_fiche: `${job?.job?.id}${formValues?.job?.label ? ` - ${formValues.job.label}` : ""}`,
    })
    notifyLbaJobDetailView(job?.job?.id)
  }, [job?.job?.id])

  const jobStartDate = job?.job?.jobStartDate ? formatDate(job.job.jobStartDate) : undefined

  const { formValues } = React.useContext(DisplayContext)

  return (
    <>
      <Box pb="0px" mt={6} position="relative" background="white" padding="16px 24px" mx={["0", "30px"]}>
        <Text as="h2" variant="itemDetailH2" mt={2} mb={4}>
          Description de l&apos;offre
        </Text>
        <Box p={4} mb={6} borderRadius="8px" background="#f6f6f6">
          <Box>
            <strong>Début du contrat le : </strong> {jobStartDate}
          </Box>
          <Box my={2}>
            <strong>Nature du contrat : </strong> {getContractTypes(job?.job?.contractType)}
          </Box>
          <Box>
            <strong>Niveau visé en fin d&apos;études :</strong>{" "}
            {job?.diplomaLevel ? (
              <Flex direction="row" wrap="wrap">
                {job?.diplomaLevel.split(", ").map(function (d, idx) {
                  return (
                    <Text as="span" key={idx} fontSize="14px" textAlign="center" color="bluefrance.500" background="#e3e3fd" py={1} px={4} borderRadius="40px" ml={2} mt={1}>
                      {d}
                    </Text>
                  )
                })}
              </Flex>
            ) : (
              "non défini"
            )}
          </Box>

          {job?.job?.elligibleHandicap && (
            <Flex mt={4} p={2} background="white" justifyContent="center" fontSize="12px" alignItems="center" direction="row">
              <Box width="30px" minWidth="30px" mr={2}>
                <Image mt="2px" src="/images/info.svg" alt="" />
              </Box>
              <Box>À compétences égales, une attention particulière sera apportée aux personnes en situation de handicap.</Box>
            </Flex>
          )}
        </Box>
        {job?.company?.mandataire ? (
          <Text>
            Offre publiée par{" "}
            <Text as="span" color="pinksoft.600" fontWeight={700}>
              {job.company.name}
            </Text>{" "}
            pour une entreprise partenaire du centre de formation.
          </Text>
        ) : (
          <>
            <Text>
              <Text as="span" color="pinksoft.600" fontWeight={700}>
                {job.company.name}
              </Text>{" "}
              nous a récemment fait parvenir un besoin de recrutement :{" "}
              <Text as="span" color="pinksoft.600" fontWeight={700}>
                {job.title}
              </Text>
              . Cela signifie que l&apos;établissement est activement à la recherche d&apos;un.e candidat.e.
            </Text>
            <Text>Vous avez donc tout intérêt à le contacter rapidement, avant que l&apos;offre ne soit pourvue !</Text>
            <Box mb="0">
              Trouver et convaincre une entreprise de vous embaucher ?
              <br />
              <Link
                isExternal
                variant="basicUnderlined"
                href="https://dinum.didask.com/courses/demonstration/60d21bf5be76560000ae916e"
                aria-label="Lien vers des conseils pour préparer son premier contact avec un CFA"
              >
                On vous donne des conseils ici pour vous aider !
                <ExternalLinkIcon mb="3px" ml="2px" />
              </Link>
            </Box>
          </>
        )}
      </Box>
      <Box pb="0px" mt={6} position="relative" background="white" padding="16px 24px" mx={["0", "30px"]}>
        <Text as="h2" variant="itemDetailH2" mt={2}>{`En savoir plus sur ${job.title}`}</Text>
        <Box data-testid="lbb-component">
          <Box mb={4}>{getDescriptionContext(job)}</Box>
        </Box>
      </Box>
    </>
  )
}

export default MatchaDetail
