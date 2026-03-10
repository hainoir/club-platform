import EventPage from "../../[id]/page"
import Modal from "../Modal"

interface InterceptedPageProps {
    params: Promise<{ id: string }>
}

export default async function InterceptedEventPage(props: InterceptedPageProps) {
    return (
        <Modal>
            <div className="bg-white dark:bg-zinc-950 p-2 sm:p-4 rounded-xl">
                <EventPage {...props} />
            </div>
        </Modal>
    )
}
